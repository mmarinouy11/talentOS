import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })

  const fromDate = new Date(from)
  const toDate = new Date(to)
  toDate.setHours(23, 59, 59, 999)

  const period = { gte: fromDate, lte: toDate }

  // Load all active recruiters
  const recruiters = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })

  // Sourcing: candidate positions added in period by recruiter, with candidate sourcedByType
  const cpRaw = await db.candidatePosition.findMany({
    where: { createdAt: period, recruiterId: { not: undefined } },
    select: { recruiterId: true, candidate: { select: { sourcedByType: true } } },
  })
  // Group manually: { recruiterId -> { RECRUITER: n, DIRECT: n, VENDOR: n } }
  const cpByRecruiterMap = new Map<string, { RECRUITER: number; DIRECT: number; VENDOR: number; OTHER: number }>()
  for (const cp of cpRaw) {
    if (!cp.recruiterId) continue
    if (!cpByRecruiterMap.has(cp.recruiterId)) cpByRecruiterMap.set(cp.recruiterId, { RECRUITER: 0, DIRECT: 0, VENDOR: 0, OTHER: 0 })
    const entry = cpByRecruiterMap.get(cp.recruiterId)!
    const t = cp.candidate.sourcedByType ?? 'OTHER'
    if (t in entry) entry[t as keyof typeof entry]++
  }

  // Average fit score per recruiter (all time for sourced candidates)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitScoresRaw = await (db.candidatePosition.groupBy as any)({
    by: ['recruiterId'],
    where: { recruiterId: { not: null }, fitScore: { not: null } },
    _avg: { fitScore: true },
  })
  const fitScores = fitScoresRaw as { recruiterId: string | null; _avg: { fitScore: number | null } }[]

  // Interview rounds created in period (join through candidatePosition.recruiterId)
  const interviewsCreated = await db.interview.findMany({
    where: { createdAt: period },
    select: {
      id: true,
      status: true,
      decision: true,
      candidatePosition: { select: { recruiterId: true } },
    },
  })

  // Stage advances in period
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageAdvancesRaw = await (db.stageHistory.groupBy as any)({
    by: ['movedById'],
    where: { movedAt: period, movedById: { not: null } },
    _count: { id: true },
  })
  const stageAdvances = stageAdvancesRaw as { movedById: string | null; _count: { id: number } }[]

  // Positions breakdown per recruiter (for detail view)
  const cpForPositions = await db.candidatePosition.findMany({
    where: { recruiterId: { not: undefined }, createdAt: period },
    select: {
      recruiterId: true,
      fitScore: true,
      positionId: true,
    },
  })

  // Load position info for the positionIds in cpForPositions
  const positionIds = [...new Set(cpForPositions.map((c) => c.positionId))]
  const positionsInfo = await db.position.findMany({
    where: { id: { in: positionIds } },
    select: { id: true, title: true, client: true },
  })
  const positionMap = new Map(positionsInfo.map((p) => [p.id, p]))

  // Daily sourcing activity last 30 days (for timeline — always last 30d regardless of filter)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const dailySourcing = await db.candidatePosition.findMany({
    where: { createdAt: { gte: thirtyDaysAgo }, recruiterId: { not: undefined } },
    select: { recruiterId: true, createdAt: true },
  })

  // Build recruiter metrics
  const fitScoreMap = new Map(fitScores.filter((f) => f.recruiterId != null).map((f) => [f.recruiterId as string, f._avg.fitScore]))
  const stageAdvanceMap = new Map(stageAdvances.filter((s) => s.movedById != null).map((s) => [s.movedById as string, s._count.id]))

  const metrics = recruiters.map((recruiter) => {
    const rid = recruiter.id

    // Sourcing counts
    const sourcing = cpByRecruiterMap.get(rid) ?? { RECRUITER: 0, DIRECT: 0, VENDOR: 0, OTHER: 0 }
    const manual = sourcing.RECRUITER
    const direct = sourcing.DIRECT
    const partner = sourcing.VENDOR
    const totalSourced = manual + direct + partner + sourcing.OTHER

    // Interview metrics
    const myInterviews = interviewsCreated.filter((i) => i.candidatePosition.recruiterId === rid)
    const roundsCreated = myInterviews.length
    const scheduled = myInterviews.filter((i) => i.status === 'SCHEDULED' || i.status === 'COMPLETED').length
    const advances = myInterviews.filter((i) => i.decision === 'ADVANCE').length
    const rejects = myInterviews.filter((i) => i.decision === 'REJECT').length
    const totalDecisions = advances + rejects
    const advanceRate = totalDecisions > 0 ? Math.round((advances / totalDecisions) * 100) : null

    // Stage advances
    const stageAdvanceCount = stageAdvanceMap.get(rid) ?? 0

    // Avg fit score
    const avgFitScore = fitScoreMap.get(rid) != null ? Math.round(fitScoreMap.get(rid)! * 10) / 10 : null

    // Positions breakdown
    const posMap = new Map<string, { id: string; title: string; client: string; count: number; totalFit: number; fitCount: number }>()
    for (const cp of cpForPositions.filter((c) => c.recruiterId === rid)) {
      const pos = positionMap.get(cp.positionId)
      if (!pos) continue
      if (!posMap.has(pos.id)) posMap.set(pos.id, { id: pos.id, title: pos.title, client: pos.client, count: 0, totalFit: 0, fitCount: 0 })
      const entry = posMap.get(pos.id)!
      entry.count++
      if (cp.fitScore != null) { entry.totalFit += cp.fitScore; entry.fitCount++ }
    }
    const positions = [...posMap.values()].map((p) => ({
      id: p.id, title: p.title, client: p.client, count: p.count,
      avgFitScore: p.fitCount > 0 ? Math.round(p.totalFit / p.fitCount * 10) / 10 : null,
    }))

    // Daily sourcing (last 30d)
    const daily = dailySourcing
      .filter((d) => d.recruiterId === rid)
      .map((d) => d.createdAt.toISOString().slice(0, 10))
      .reduce((acc: Record<string, number>, day) => { acc[day] = (acc[day] ?? 0) + 1; return acc }, {})

    return {
      id: rid,
      name: recruiter.name,
      email: recruiter.email,
      role: recruiter.role,
      manual, direct, partner, totalSourced,
      roundsCreated, scheduled, advances, rejects, advanceRate,
      stageAdvances: stageAdvanceCount,
      avgFitScore,
      positions,
      dailySourcing: daily,
    }
  })

  return NextResponse.json({ metrics, from: fromDate.toISOString(), to: toDate.toISOString() })
}
