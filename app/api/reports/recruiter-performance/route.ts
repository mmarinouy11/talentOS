import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

function countWorkingDays(from: Date, to: Date): number {
  let count = 0
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(count, 1)
}

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
  const workingDays = countWorkingDays(fromDate, toDate)

  try {
  const recruiters = await db.user.findMany({
    where: { active: true, role: 'RECRUITER' },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })

  // Sourcing: candidate positions added in period by recruiter, with candidate sourcedByType
  const cpRaw = await db.$queryRaw<{ recruiterId: string; sourcedByType: string | null }[]>`
    SELECT cp."recruiterId", c."sourcedByType"
    FROM "CandidatePosition" cp
    JOIN "Candidate" c ON c.id = cp."candidateId"
    WHERE cp."createdAt" >= ${fromDate} AND cp."createdAt" <= ${toDate}
  `
  const cpByRecruiterMap = new Map<string, { RECRUITER: number; DIRECT: number; VENDOR: number; OTHER: number }>()
  for (const cp of cpRaw) {
    if (!cp.recruiterId) continue
    if (!cpByRecruiterMap.has(cp.recruiterId)) cpByRecruiterMap.set(cp.recruiterId, { RECRUITER: 0, DIRECT: 0, VENDOR: 0, OTHER: 0 })
    const entry = cpByRecruiterMap.get(cp.recruiterId)!
    const t = cp.sourcedByType ?? 'OTHER'
    if (t in entry) entry[t as keyof typeof entry]++
  }

  // Avg fit score: manually sourced candidates only (sourcedByType=RECRUITER, sourcedByUserId=this recruiter), period-filtered
  const fitScoresRaw = await db.$queryRaw<{ recruiterId: string; avg_fit: number | null }[]>`
    SELECT cp."recruiterId", AVG(cp."fitScore") as avg_fit
    FROM "CandidatePosition" cp
    JOIN "Candidate" c ON c.id = cp."candidateId"
    WHERE cp."recruiterId" IS NOT NULL AND cp."fitScore" IS NOT NULL
      AND cp."createdAt" >= ${fromDate} AND cp."createdAt" <= ${toDate}
      AND c."sourcedByType" = 'RECRUITER'
      AND c."sourcedByUserId" = cp."recruiterId"
    GROUP BY cp."recruiterId"
  `
  const fitScoreMap = new Map(fitScoresRaw.map((r) => [r.recruiterId, r.avg_fit != null ? Math.round(r.avg_fit * 10) / 10 : null]))

  // All interviews scheduled in period (all stages, status SCHEDULED|COMPLETED, scheduledAt in period)
  const interviewsInPeriod = await db.$queryRaw<{ recruiterId: string; stage: string; decision: string | null }[]>`
    SELECT cp."recruiterId", i."stage", i."decision"
    FROM "Interview" i
    JOIN "CandidatePosition" cp ON cp.id = i."candidatePositionId"
    WHERE i."scheduledAt" >= ${fromDate} AND i."scheduledAt" <= ${toDate}
      AND i."status" IN ('SCHEDULED', 'COMPLETED')
  `

  // Positions breakdown per recruiter (for detail view)
  const cpForPositions = await db.candidatePosition.findMany({
    where: { createdAt: period },
    select: { recruiterId: true, fitScore: true, positionId: true },
  })

  // Load position info
  const positionIds = [...new Set(cpForPositions.map((c) => c.positionId))]
  const positionsInfo = positionIds.length > 0 ? await db.position.findMany({
    where: { id: { in: positionIds } },
    select: { id: true, title: true, client: true },
  }) : []
  const positionMap = new Map(positionsInfo.map((p) => [p.id, p]))

  // Active positions per recruiter (current snapshot, no period filter)
  const activePositionsRaw = await db.$queryRaw<{ recruiterId: string; cnt: bigint }[]>`
    SELECT "recruiterId", COUNT(DISTINCT "positionId") as cnt
    FROM "CandidatePosition"
    WHERE "status" = 'ACTIVE'
    GROUP BY "recruiterId"
  `
  const activePositionsMap = new Map(activePositionsRaw.map((r) => [r.recruiterId, Number(r.cnt)]))

  // Days to screening done: cp.createdAt → SCREENING interview updatedAt when status=COMPLETED
  const daysToScreeningRaw = await db.$queryRaw<{ recruiterId: string; avg_days: number | null }[]>`
    SELECT cp."recruiterId", AVG(
      EXTRACT(EPOCH FROM (screening."updatedAt" - cp."createdAt")) / 86400.0
    ) as avg_days
    FROM "CandidatePosition" cp
    JOIN LATERAL (
      SELECT i."updatedAt"
      FROM "Interview" i
      WHERE i."candidatePositionId" = cp.id
        AND i."stage" = 'SCREENING'
        AND i."status" = 'COMPLETED'
      ORDER BY i."updatedAt" ASC
      LIMIT 1
    ) screening ON true
    WHERE cp."createdAt" >= ${fromDate} AND cp."createdAt" <= ${toDate}
    GROUP BY cp."recruiterId"
  `
  const daysToScreeningMap = new Map(daysToScreeningRaw.map((r) => [r.recruiterId, r.avg_days != null ? Math.round(r.avg_days * 10) / 10 : null]))

  // Daily sourcing uses period
  const dailySourcing = await db.candidatePosition.findMany({
    where: { createdAt: period },
    select: { recruiterId: true, createdAt: true },
  })

  const metrics = recruiters.map((recruiter) => {
    const rid = recruiter.id

    // Sourcing counts
    const sourcing = cpByRecruiterMap.get(rid) ?? { RECRUITER: 0, DIRECT: 0, VENDOR: 0, OTHER: 0 }
    const manual = sourcing.RECRUITER
    const direct = sourcing.DIRECT
    const partner = sourcing.VENDOR

    // All stages, all scheduled/completed interviews in period
    const myInterviews = interviewsInPeriod.filter((i) => i.recruiterId === rid)
    const interviewsScheduled = myInterviews.length

    // Daily screening effort (SCREENING stage only)
    const screeningCount = myInterviews.filter((i) => i.stage === 'SCREENING').length
    const screeningHrsPerDay = Math.round((screeningCount * 30 / 60 / workingDays) * 10) / 10

    // Advances/rejects: SCREENING stage only
    const screeningInterviews = myInterviews.filter((i) => i.stage === 'SCREENING')
    const advances = screeningInterviews.filter((i) => i.decision === 'ADVANCE').length
    const rejects = screeningInterviews.filter((i) => i.decision === 'REJECT').length
    const totalDecisions = advances + rejects
    const advanceRate = totalDecisions > 0 ? Math.round((advances / totalDecisions) * 100) : null

    // Avg fit score (manually sourced only, period-filtered)
    const avgFitScore = fitScoreMap.get(rid) != null ? Math.round(fitScoreMap.get(rid)! * 10) / 10 : null

    // Active positions
    const activePositions = activePositionsMap.get(rid) ?? 0

    // Days to screening done
    const daysToScreeningDone = daysToScreeningMap.get(rid) ?? null

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

    // Daily sourcing uses period
    const daily = dailySourcing
      .filter((d) => d.recruiterId === rid)
      .map((d) => d.createdAt.toISOString().slice(0, 10))
      .reduce((acc: Record<string, number>, day) => { acc[day] = (acc[day] ?? 0) + 1; return acc }, {})

    return {
      id: rid,
      name: recruiter.name,
      email: recruiter.email,
      role: recruiter.role,
      manual, direct, partner,
      interviewsScheduled,
      screeningHrsPerDay,
      advances, rejects, advanceRate,
      avgFitScore,
      activePositions,
      daysToScreeningDone,
      positions,
      dailySourcing: daily,
    }
  })

  return NextResponse.json({ metrics, from: fromDate.toISOString(), to: toDate.toISOString() })
  } catch (err) {
    console.error('[recruiter-performance] Error:', err)
    return NextResponse.json({ error: 'Failed to load recruiter performance data' }, { status: 500 })
  }
}
