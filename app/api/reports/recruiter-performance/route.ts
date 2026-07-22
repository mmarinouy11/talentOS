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
  // Fix 1: only RECRUITER role users
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

  // Fix 7: avgFitScore filtered by period
  const fitScoresRaw = await db.$queryRaw<{ recruiterId: string; avg_fit: number | null }[]>`
    SELECT "recruiterId", AVG("fitScore") as avg_fit
    FROM "CandidatePosition"
    WHERE "recruiterId" IS NOT NULL AND "fitScore" IS NOT NULL
      AND "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
    GROUP BY "recruiterId"
  `
  const fitScoreMap = new Map(fitScoresRaw.map((r) => [r.recruiterId, r.avg_fit != null ? Math.round(r.avg_fit * 10) / 10 : null]))

  // Fix 2: interviews scheduled in period (scheduledAt in period, status SCHEDULED|COMPLETED)
  const interviewsInPeriod = await db.$queryRaw<{ recruiterId: string; stage: string; decision: string | null }[]>`
    SELECT cp."recruiterId", i."stage", i."decision"
    FROM "Interview" i
    JOIN "CandidatePosition" cp ON cp.id = i."candidatePositionId"
    WHERE i."scheduledAt" >= ${fromDate} AND i."scheduledAt" <= ${toDate}
      AND i."status" IN ('SCHEDULED', 'COMPLETED')
  `

  // Stage advances in period
  const stageAdvancesRaw = await db.$queryRaw<{ movedById: string; cnt: bigint }[]>`
    SELECT "movedById", COUNT(*) as cnt
    FROM "StageHistory"
    WHERE "movedAt" >= ${fromDate} AND "movedAt" <= ${toDate}
    GROUP BY "movedById"
  `
  const stageAdvanceMap = new Map(stageAdvancesRaw.map((r) => [r.movedById, Number(r.cnt)]))

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

  // Fix 4: active positions per recruiter (current snapshot, no period filter)
  const activePositionsRaw = await db.$queryRaw<{ recruiterId: string; cnt: bigint }[]>`
    SELECT "recruiterId", COUNT(DISTINCT "positionId") as cnt
    FROM "CandidatePosition"
    WHERE "status" = 'ACTIVE'
    GROUP BY "recruiterId"
  `
  const activePositionsMap = new Map(activePositionsRaw.map((r) => [r.recruiterId, Number(r.cnt)]))

  // Fix 5: avg days from CandidatePosition.createdAt to first Interview.scheduledAt
  const avgDaysRaw = await db.$queryRaw<{ recruiterId: string; avg_days: number | null }[]>`
    SELECT cp."recruiterId", AVG(
      EXTRACT(EPOCH FROM (first_interview."scheduledAt" - cp."createdAt")) / 86400.0
    ) as avg_days
    FROM "CandidatePosition" cp
    JOIN LATERAL (
      SELECT i."scheduledAt"
      FROM "Interview" i
      WHERE i."candidatePositionId" = cp.id AND i."scheduledAt" IS NOT NULL
      ORDER BY i."scheduledAt" ASC
      LIMIT 1
    ) first_interview ON true
    WHERE cp."createdAt" >= ${fromDate} AND cp."createdAt" <= ${toDate}
    GROUP BY cp."recruiterId"
  `
  const avgDaysMap = new Map(avgDaysRaw.map((r) => [r.recruiterId, r.avg_days != null ? Math.round(r.avg_days * 10) / 10 : null]))

  // Fix 6: dailySourcing uses period dates
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
    const totalSourced = manual + direct + partner + sourcing.OTHER

    // Fix 2: single interviews scheduled metric
    const myInterviews = interviewsInPeriod.filter((i) => i.recruiterId === rid)
    const interviewsScheduled = myInterviews.length

    // Fix 3: daily screening effort
    const screeningCount = myInterviews.filter((i) => i.stage === 'SCREENING').length
    const screeningHrsPerDay = Math.round((screeningCount * 30 / 60 / workingDays) * 10) / 10

    // Decisions
    const advances = myInterviews.filter((i) => i.decision === 'ADVANCE').length
    const rejects = myInterviews.filter((i) => i.decision === 'REJECT').length
    const totalDecisions = advances + rejects
    const advanceRate = totalDecisions > 0 ? Math.round((advances / totalDecisions) * 100) : null

    // Stage advances
    const stageAdvanceCount = stageAdvanceMap.get(rid) ?? 0

    // Avg fit score (period-filtered)
    const avgFitScore = fitScoreMap.get(rid) != null ? Math.round(fitScoreMap.get(rid)! * 10) / 10 : null

    // Fix 4: active positions
    const activePositions = activePositionsMap.get(rid) ?? 0

    // Fix 5: avg days to first interview
    const avgDaysToFirstInterview = avgDaysMap.get(rid) ?? null

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

    // Fix 6: daily sourcing uses period
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
      interviewsScheduled,
      screeningHrsPerDay,
      advances, rejects, advanceRate,
      stageAdvances: stageAdvanceCount,
      avgFitScore,
      activePositions,
      avgDaysToFirstInterview,
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
