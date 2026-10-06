import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import type { PositionStatus } from '@prisma/client'

const QUALIFIED_TARGET = 30
const TECH_TARGET = 0.6
const WEIGHTS = { qualified: 0.25, sla: 0.25, tech: 0.2, closures: 0.3 }

function businessDaysBetween(from: Date, to: Date): number {
  if (to < from) return 0
  let count = 0
  const cur = new Date(from); cur.setHours(0, 0, 0, 0)
  const end = new Date(to);   end.setHours(0, 0, 0, 0)
  while (cur <= end) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function addBusinessDays(date: Date, n: number): Date {
  const result = new Date(date); result.setHours(0, 0, 0, 0)
  let rem = n
  while (rem > 0) {
    result.setDate(result.getDate() + 1)
    const d = result.getDay()
    if (d !== 0 && d !== 6) rem--
  }
  return result
}

function subtractBusinessDays(date: Date, n: number): Date {
  const result = new Date(date); result.setHours(0, 0, 0, 0)
  let rem = n
  while (rem > 0) {
    result.setDate(result.getDate() - 1)
    const d = result.getDay()
    if (d !== 0 && d !== 6) rem--
  }
  return result
}

type SlaEval = {
  result: 'met' | 'partial' | 'missed' | 'in_progress' | 'na'
  count: number
  need: number
  windowBd: number
  days: number | null
  progress: number
  final: boolean
}

// Partial credit: share of the `need` qualified candidates delivered within `windowBd`
// business days of kickoff. A position counts toward attainment once its window has
// closed (or it's already complete); until then it's in progress.
function evalSla(kickoff: Date, qualifiedDates: Date[], windowBd: number, need: number, slaRef: Date): SlaEval {
  const count = Math.min(need, qualifiedDates.filter((d) => businessDaysBetween(kickoff, d) <= windowBd).length)
  const closed = addBusinessDays(kickoff, windowBd) < slaRef
  const final = closed || count === need
  const nth = qualifiedDates[need - 1]
  return {
    result: count === need ? 'met' : !final ? 'in_progress' : count > 0 ? 'partial' : 'missed',
    count, need, windowBd,
    days: nth ? businessDaysBetween(kickoff, nth) : null,
    progress: count / need,
    final,
  }
}

const NA_SLA = (windowBd: number, need: number): SlaEval =>
  ({ result: 'na', count: 0, need, windowBd, days: null, progress: 0, final: false })

function aggregateSla(evals: SlaEval[]) {
  const finals = evals.filter((e) => e.final)
  const withDays = evals.filter((e) => e.days != null)
  return {
    attainment: finals.length > 0 ? Math.round((finals.reduce((s, e) => s + e.progress, 0) / finals.length) * 100) : null,
    met: evals.filter((e) => e.result === 'met').length,
    decided: finals.length,
    inProgress: evals.length - finals.length,
    avgDays: withDays.length > 0 ? Math.round((withDays.reduce((s, e) => s + e.days!, 0) / withDays.length) * 10) / 10 : null,
  }
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [year, mon] = month.split('-').map(Number)
  const start = new Date(year, mon - 1, 1)
  const end = new Date(year, mon, 0, 23, 59, 59, 999)
  return { start, end }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month = searchParams.get('month') ?? currentMonth
  const isCurrentMonth = month === currentMonth

  const { start: monthStart, end: monthEnd } = monthBounds(month)

  const totalBD = businessDaysBetween(monthStart, monthEnd)
  const elapsedBD = isCurrentMonth ? Math.max(1, businessDaysBetween(monthStart, now)) : totalBD

  // SLA window: positions whose kickoff + 5bd overlaps into this month
  const slaWindowStart = subtractBusinessDays(monthStart, 5)
  // Deadline comparison reference: current time for current month, monthEnd for past months
  const slaRef = isCurrentMonth ? now : monthEnd

  try {
    const recruiters = await db.user.findMany({
      where: { active: true, role: 'RECRUITER' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })
    const recruiterIds = recruiters.map((r) => r.id)

    // Assigned positions: position.recruiterId = recruiter, created <= monthEnd, not deleted
    const assignedPositions = await db.position.findMany({
      where: {
        recruiterId: { in: recruiterIds },
        deletedAt: null,
        createdAt: { lte: monthEnd },
        NOT: [
          { status: { in: ['CLOSED', 'FILLED'] }, updatedAt: { lt: monthStart } },
          { status: 'CANCELLED', cancelledAt: { lt: monthStart } },
          { status: 'CANCELLED', cancelledAt: null },
        ],
      },
      select: {
        id: true, title: true, status: true, headcount: true,
        createdAt: true, recruiterId: true,
        candidatePositions: {
          where: { candidate: { deletedAt: null }, stage: 'HIRED' },
          select: { id: true },
        },
      },
    })

    // Activity sets: cp.recruiterId had activity (CP created, interview scheduled, decision) in month
    const cpCreatedInMonth = await db.$queryRaw<{ recruiterId: string; positionId: string }[]>`
      SELECT cp."recruiterId", cp."positionId"
      FROM "CandidatePosition" cp
      WHERE cp."createdAt" >= ${monthStart} AND cp."createdAt" <= ${monthEnd}
        AND cp."recruiterId" IS NOT NULL
    `
    const ivScheduledInMonth = await db.$queryRaw<{ recruiterId: string; positionId: string }[]>`
      SELECT cp."recruiterId", cp."positionId"
      FROM "Interview" i
      JOIN "CandidatePosition" cp ON cp.id = i."candidatePositionId"
      WHERE i."scheduledAt" >= ${monthStart} AND i."scheduledAt" <= ${monthEnd}
        AND i."status" IN ('SCHEDULED', 'COMPLETED')
        AND cp."recruiterId" IS NOT NULL
    `
    const ivDecisionInMonth = await db.$queryRaw<{ recruiterId: string; positionId: string }[]>`
      SELECT cp."recruiterId", cp."positionId"
      FROM "Interview" i
      JOIN "CandidatePosition" cp ON cp.id = i."candidatePositionId"
      WHERE COALESCE(i."decidedAt", i."updatedAt") >= ${monthStart}
        AND COALESCE(i."decidedAt", i."updatedAt") <= ${monthEnd}
        AND i."decision" IS NOT NULL
        AND cp."recruiterId" IS NOT NULL
    `
    const activityMap = new Map<string, Set<string>>()
    for (const row of [...cpCreatedInMonth, ...ivScheduledInMonth, ...ivDecisionInMonth]) {
      if (!activityMap.has(row.recruiterId)) activityMap.set(row.recruiterId, new Set())
      activityMap.get(row.recruiterId)!.add(row.positionId)
    }
    const activityPosIds = [...new Set([...activityMap.values()].flatMap((s) => [...s]))]
    const activityPositions = activityPosIds.length > 0 ? await db.position.findMany({
      where: { id: { in: activityPosIds }, deletedAt: null },
      select: { id: true, title: true, status: true, headcount: true, createdAt: true },
    }) : []
    type ActivityPos = { id: string; title: string; status: PositionStatus; headcount: number | null; createdAt: Date }
    const activityPosById = new Map<string, ActivityPos>(activityPositions.map((p: ActivityPos) => [p.id, p]))

    // Qualified candidates in month: SCREENING ADVANCE, decidedAt fallback updatedAt in month
    const qualifiedRaw = await db.$queryRaw<{
      recruiterId: string; positionId: string; cpId: string
      decidedAt: Date; firstName: string; lastName: string; positionTitle: string
    }[]>`
      SELECT cp."recruiterId", cp."positionId", cp.id as "cpId",
             COALESCE(i."decidedAt", i."updatedAt") as "decidedAt",
             c."firstName", c."lastName", p."title" as "positionTitle"
      FROM "Interview" i
      JOIN "CandidatePosition" cp ON cp.id = i."candidatePositionId"
      JOIN "Candidate" c ON c.id = cp."candidateId"
      JOIN "Position" p ON p.id = cp."positionId"
      WHERE i."stage" = 'SCREENING' AND i."decision" = 'ADVANCE'
        AND COALESCE(i."decidedAt", i."updatedAt") >= ${monthStart}
        AND COALESCE(i."decidedAt", i."updatedAt") <= ${monthEnd}
        AND cp."recruiterId" IS NOT NULL
    `

    // All-time first/third qualified per position (for SLA computation)
    const allQualifiedByPositionRaw = await db.$queryRaw<{ positionId: string; decidedAt: Date }[]>`
      SELECT cp."positionId", COALESCE(i."decidedAt", i."updatedAt") as "decidedAt"
      FROM "Interview" i
      JOIN "CandidatePosition" cp ON cp.id = i."candidatePositionId"
      WHERE i."stage" = 'SCREENING' AND i."decision" = 'ADVANCE'
      ORDER BY COALESCE(i."decidedAt", i."updatedAt") ASC
    `
    const qualifiedByPos = new Map<string, Date[]>()
    for (const row of allQualifiedByPositionRaw) {
      if (!qualifiedByPos.has(row.positionId)) qualifiedByPos.set(row.positionId, [])
      qualifiedByPos.get(row.positionId)!.push(new Date(row.decidedAt))
    }

    // Tech evaluation events in month for recruiter-screened candidates:
    // pass = tech ADVANCE, or a stage move out of TECHNICAL_INTERVIEW to a later stage
    // (covers rounds advanced without a recorded decision); fail = tech REJECT.
    // Events after a withdrawal are dropped; HOLD/pending never produce an event.
    const techEventsRaw = await db.$queryRaw<{ cpId: string; recruiterId: string; kind: 'pass' | 'fail'; at: Date }[]>`
      WITH events AS (
        SELECT i."candidatePositionId" AS "cpId",
               CASE WHEN i."decision" = 'ADVANCE' THEN 'pass' ELSE 'fail' END AS kind,
               COALESCE(i."decidedAt", i."updatedAt") AS at
        FROM "Interview" i
        WHERE i."stage" = 'TECHNICAL_INTERVIEW'
          AND i."decision" IN ('ADVANCE', 'REJECT')
          AND COALESCE(i."decidedAt", i."updatedAt") >= ${monthStart}
          AND COALESCE(i."decidedAt", i."updatedAt") <= ${monthEnd}
        UNION ALL
        SELECT sh."candidatePositionId" AS "cpId", 'pass' AS kind, sh."movedAt" AS at
        FROM "StageHistory" sh
        WHERE sh."fromStage" = 'TECHNICAL_INTERVIEW'
          AND sh."toStage" IN ('MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER', 'HIRED')
          AND sh."movedAt" >= ${monthStart} AND sh."movedAt" <= ${monthEnd}
      )
      SELECT e."cpId", cp."recruiterId", e.kind, e.at
      FROM events e
      JOIN "CandidatePosition" cp ON cp.id = e."cpId"
      WHERE cp."recruiterId" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "Interview" s
          WHERE s."candidatePositionId" = cp.id
            AND s."stage" = 'SCREENING' AND s."decision" = 'ADVANCE'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "StageHistory" w
          WHERE w."candidatePositionId" = cp.id
            AND w."toStage" = 'WITHDRAWN'
            AND w."movedAt" < e.at
        )
    `
    // One outcome per candidate-position: the latest event in the month wins
    const techOutcomeByCp = new Map<string, { recruiterId: string; kind: 'pass' | 'fail'; at: Date }>()
    for (const ev of techEventsRaw) {
      const at = new Date(ev.at)
      const prev = techOutcomeByCp.get(ev.cpId)
      if (!prev || at > prev.at) techOutcomeByCp.set(ev.cpId, { recruiterId: ev.recruiterId, kind: ev.kind, at })
    }
    const techOutcomes = [...techOutcomeByCp.values()]

    // Closures: distinct candidate-positions moved to HIRED in month (earliest move = hire date)
    const closuresRaw = await db.$queryRaw<{
      recruiterId: string; positionId: string; cpId: string
      hireDate: Date; firstName: string; lastName: string
      positionTitle: string; startDate: Date | null
    }[]>`
      SELECT cp."recruiterId", cp."positionId", cp.id as "cpId",
             MIN(sh."movedAt") as "hireDate",
             c."firstName", c."lastName", p."title" as "positionTitle",
             cp."startDate"
      FROM "StageHistory" sh
      JOIN "CandidatePosition" cp ON cp.id = sh."candidatePositionId"
      JOIN "Candidate" c ON c.id = cp."candidateId"
      JOIN "Position" p ON p.id = cp."positionId"
      WHERE sh."toStage" = 'HIRED'
        AND sh."movedAt" >= ${monthStart} AND sh."movedAt" <= ${monthEnd}
        AND cp."recruiterId" IS NOT NULL
      GROUP BY cp.id, cp."recruiterId", cp."positionId", cp."startDate",
               c."firstName", c."lastName", p."title"
    `

    // === Activity section (existing metrics, period = month) ===
    const cpActivityRaw = await db.$queryRaw<{ recruiterId: string; sourcedByType: string | null }[]>`
      SELECT cp."recruiterId", c."sourcedByType"
      FROM "CandidatePosition" cp
      JOIN "Candidate" c ON c.id = cp."candidateId"
      WHERE cp."createdAt" >= ${monthStart} AND cp."createdAt" <= ${monthEnd}
    `
    const actSourcingMap = new Map<string, { manual: number; direct: number; partner: number }>()
    for (const cp of cpActivityRaw) {
      if (!cp.recruiterId) continue
      if (!actSourcingMap.has(cp.recruiterId)) actSourcingMap.set(cp.recruiterId, { manual: 0, direct: 0, partner: 0 })
      const e = actSourcingMap.get(cp.recruiterId)!
      if (cp.sourcedByType === 'RECRUITER') e.manual++
      else if (cp.sourcedByType === 'OTHER') e.direct++
      else if (cp.sourcedByType === 'VENDOR') e.partner++
    }

    const fitScoresRaw = await db.$queryRaw<{ recruiterId: string; avg_fit: number | null }[]>`
      SELECT cp."recruiterId", AVG(cp."fitScore") as avg_fit
      FROM "CandidatePosition" cp
      JOIN "Candidate" c ON c.id = cp."candidateId"
      WHERE cp."recruiterId" IS NOT NULL AND cp."fitScore" IS NOT NULL
        AND cp."createdAt" >= ${monthStart} AND cp."createdAt" <= ${monthEnd}
        AND c."sourcedByType" = 'RECRUITER'
        AND c."sourcedByUserId" = cp."recruiterId"
      GROUP BY cp."recruiterId"
    `
    const fitScoreMap = new Map(fitScoresRaw.map((r) => [r.recruiterId, r.avg_fit != null ? Math.round(r.avg_fit * 10) / 10 : null]))

    const ivInMonth = await db.$queryRaw<{ recruiterId: string; stage: string; decision: string | null }[]>`
      SELECT cp."recruiterId", i."stage", i."decision"
      FROM "Interview" i
      JOIN "CandidatePosition" cp ON cp.id = i."candidatePositionId"
      WHERE i."scheduledAt" >= ${monthStart} AND i."scheduledAt" <= ${monthEnd}
        AND i."status" IN ('SCHEDULED', 'COMPLETED')
    `

    const workingDays = Math.max(1, businessDaysBetween(monthStart, monthEnd))
    const daysToScreeningRaw = await db.$queryRaw<{ recruiterId: string; avg_days: number | null }[]>`
      SELECT cp."recruiterId", AVG(
        EXTRACT(EPOCH FROM (screening."updatedAt" - cp."createdAt")) / 86400.0
      ) as avg_days
      FROM "CandidatePosition" cp
      JOIN LATERAL (
        SELECT i."updatedAt"
        FROM "Interview" i
        WHERE i."candidatePositionId" = cp.id
          AND i."stage" = 'SCREENING' AND i."status" = 'COMPLETED'
        ORDER BY i."updatedAt" ASC LIMIT 1
      ) screening ON true
      WHERE cp."createdAt" >= ${monthStart} AND cp."createdAt" <= ${monthEnd}
      GROUP BY cp."recruiterId"
    `
    const daysToScreeningMap = new Map(daysToScreeningRaw.map((r) => [r.recruiterId, r.avg_days != null ? Math.round(r.avg_days * 10) / 10 : null]))

    const dailySourcingRaw = await db.candidatePosition.findMany({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
      select: { recruiterId: true, createdAt: true },
    })

    const activePositionsRaw = await db.$queryRaw<{ recruiterId: string; cnt: bigint }[]>`
      SELECT "recruiterId", COUNT(DISTINCT "positionId") as cnt
      FROM "CandidatePosition"
      WHERE "status" = 'ACTIVE'
      GROUP BY "recruiterId"
    `
    const activePositionsMap = new Map(activePositionsRaw.map((r) => [r.recruiterId, Number(r.cnt)]))

    // === Build per-recruiter metrics ===
    const metrics = recruiters.map((recruiter) => {
      const rid = recruiter.id
      const myPositions = assignedPositions.filter((p) => p.recruiterId === rid)
      const myActivityPosIds = activityMap.get(rid) ?? new Set<string>()

      // Demand
      let openHeadcount = 0
      for (const pos of myPositions) {
        const hc = pos.headcount ?? 1
        const hired = pos.candidatePositions.length
        openHeadcount += Math.max(0, hc - hired)
      }

      // KPI 1: Qualified
      const myQualified = qualifiedRaw.filter((q) => q.recruiterId === rid)
      const qualifiedCount = myQualified.length
      const positionsWithActivity = myActivityPosIds.size
      const qualifiedPerActive = positionsWithActivity > 0
        ? Math.round((qualifiedCount / positionsWithActivity) * 10) / 10 : null
      const pace = isCurrentMonth && elapsedBD > 0
        ? Math.round((qualifiedCount / elapsedBD) * totalBD) : null

      // KPI 2: Time to submission — positions in SLA window
      const slaPositions = myPositions.filter((p) => {
        const k = new Date(p.createdAt)
        return k >= slaWindowStart && k <= monthEnd
      })
      const slaById = new Map(slaPositions.map((pos) => {
        const kickoff = new Date(pos.createdAt)
        const q = qualifiedByPos.get(pos.id) ?? []
        return [pos.id, { first: evalSla(kickoff, q, 3, 1, slaRef), shortlist: evalSla(kickoff, q, 5, 3, slaRef) }]
      }))
      const firstAgg = aggregateSla([...slaById.values()].map((s) => s.first))
      const shortAgg = aggregateSla([...slaById.values()].map((s) => s.shortlist))

      // KPI 3: Tech pass rate (one outcome per candidate-position)
      const myTech = techOutcomes.filter((t) => t.recruiterId === rid)
      const techAdvances = myTech.filter((t) => t.kind === 'pass').length
      const techTotal = myTech.length
      const techPassRate = techTotal > 0 ? Math.round((techAdvances / techTotal) * 100) : null

      // KPI 4: Closures
      const myClosures = closuresRaw.filter((c) => c.recruiterId === rid)
      const closureCount = myClosures.length
      const closureTarget = openHeadcount < 2 ? openHeadcount : 2
      const closureIsNA = openHeadcount === 0
      const closureIsLowDemand = !closureIsNA && openHeadcount < 2

      // Achievement: weighted attainment, each KPI capped at 100%, N/A weights re-normalized
      const cap = (x: number) => Math.min(1, x)
      const slaParts = [firstAgg.attainment, shortAgg.attainment]
        .filter((x): x is number => x != null)
        .map((x) => x / 100)
      const kpiParts: { key: string; label: string; weight: number; attainment: number | null }[] = [
        { key: 'qualified', label: 'Qualified', weight: WEIGHTS.qualified, attainment: cap(qualifiedCount / QUALIFIED_TARGET) },
        { key: 'sla', label: 'Time to 1st submission', weight: WEIGHTS.sla, attainment: slaParts.length > 0 ? cap(slaParts.reduce((a, b) => a + b, 0) / slaParts.length) : null },
        { key: 'tech', label: 'Tech evaluation quality', weight: WEIGHTS.tech, attainment: techTotal > 0 ? cap(techAdvances / techTotal / TECH_TARGET) : null },
        { key: 'closures', label: 'Closures', weight: WEIGHTS.closures, attainment: closureIsNA ? null : cap(closureCount / closureTarget) },
      ]
      const applicableWeight = kpiParts.reduce((s, k) => s + (k.attainment != null ? k.weight : 0), 0)
      const breakdown = kpiParts.map((k) => {
        const effectiveWeight = k.attainment != null && applicableWeight > 0 ? k.weight / applicableWeight : 0
        return {
          key: k.key, label: k.label,
          weight: Math.round(k.weight * 100),
          attainment: k.attainment != null ? Math.round(k.attainment * 100) : null,
          effectiveWeight: Math.round(effectiveWeight * 1000) / 10,
          contribution: k.attainment != null ? Math.round(k.attainment * effectiveWeight * 1000) / 10 : null,
        }
      })
      const achievementScore = applicableWeight > 0
        ? Math.round(kpiParts.reduce((s, k) => s + (k.attainment != null ? k.attainment * (k.weight / applicableWeight) : 0), 0) * 100)
        : null

      // Drill-down
      const drillPositions = myPositions.map((pos) => {
        const kickoff = new Date(pos.createdAt)
        const sla = slaById.get(pos.id)
        const firstSLA = sla?.first ?? NA_SLA(3, 1)
        const shortlistSLA = sla?.shortlist ?? NA_SLA(5, 3)
        return {
          id: pos.id, title: pos.title, status: pos.status,
          headcount: pos.headcount ?? 1,
          kickoff: kickoff.toISOString(),
          firstSLA, shortlistSLA,
          activityOnly: false,
        }
      })
      const assignedIds = new Set(myPositions.map((p) => p.id))
      for (const pid of myActivityPosIds) {
        if (assignedIds.has(pid)) continue
        const pos = activityPosById.get(pid)
        if (!pos) continue
        drillPositions.push({
          id: pos.id, title: pos.title, status: pos.status,
          headcount: pos.headcount ?? 1,
          kickoff: new Date(pos.createdAt).toISOString(),
          firstSLA: NA_SLA(3, 1),
          shortlistSLA: NA_SLA(5, 3),
          activityOnly: true,
        })
      }

      // Activity section
      const sourcing = actSourcingMap.get(rid) ?? { manual: 0, direct: 0, partner: 0 }
      const myIv = ivInMonth.filter((i) => i.recruiterId === rid)
      const screenIvs = myIv.filter((i) => i.stage === 'SCREENING')
      const actAdv = screenIvs.filter((i) => i.decision === 'ADVANCE').length
      const actRej = screenIvs.filter((i) => i.decision === 'REJECT').length
      const actTotal = actAdv + actRej
      const dailySourcing = dailySourcingRaw
        .filter((d) => d.recruiterId === rid)
        .map((d) => d.createdAt.toISOString().slice(0, 10))
        .reduce((acc: Record<string, number>, day) => { acc[day] = (acc[day] ?? 0) + 1; return acc }, {})

      return {
        id: rid,
        name: recruiter.name,
        email: recruiter.email,
        demand: {
          assignedPositions: myPositions.length,
          positionsWithActivity,
          openHeadcountAssigned: openHeadcount,
          positionList: myPositions.map((p) => ({
            id: p.id, title: p.title, status: p.status,
            headcount: p.headcount ?? 1,
            kickoff: new Date(p.createdAt).toISOString(),
          })),
        },
        qualified: {
          count: qualifiedCount,
          perActivePosition: qualifiedPerActive,
          pace,
          target: QUALIFIED_TARGET,
        },
        timeToSubmission: {
          first: firstAgg,
          shortlist: shortAgg,
        },
        techPassRate: { rate: techPassRate, advances: techAdvances, total: techTotal },
        closures: { count: closureCount, target: closureTarget, stretch: 3, isLowDemand: closureIsLowDemand, isNA: closureIsNA },
        achievement: {
          score: achievementScore,
          naKpis: breakdown.filter((b) => b.attainment == null).map((b) => b.label),
          breakdown,
        },
        drillDown: {
          positions: drillPositions,
          qualifiedCandidates: myQualified.map((q) => ({
            name: `${q.firstName} ${q.lastName}`,
            cpId: q.cpId, positionId: q.positionId, positionTitle: q.positionTitle,
            date: new Date(q.decidedAt).toISOString(),
          })),
          closuresList: myClosures.map((c) => ({
            name: `${c.firstName} ${c.lastName}`,
            cpId: c.cpId, positionId: c.positionId, positionTitle: c.positionTitle,
            hireDate: new Date(c.hireDate).toISOString(),
            startDate: c.startDate ? new Date(c.startDate).toISOString() : null,
          })),
        },
        activity: {
          manual: sourcing.manual,
          direct: sourcing.direct,
          partner: sourcing.partner,
          interviewsScheduled: myIv.length,
          screeningHrsPerDay: Math.round((screenIvs.length * 30 / 60 / workingDays) * 10) / 10,
          advances: actAdv,
          rejects: actRej,
          advanceRate: actTotal > 0 ? Math.round((actAdv / actTotal) * 100) : null,
          avgFitScore: fitScoreMap.get(rid) ?? null,
          activePositions: activePositionsMap.get(rid) ?? 0,
          daysToScreeningDone: daysToScreeningMap.get(rid) ?? null,
          dailySourcing,
        },
      }
    })

    return NextResponse.json({
      month,
      isCurrentMonth,
      totalBD,
      elapsedBD,
      metrics,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[recruiter-performance] Error:', err)
    return NextResponse.json({ error: 'Failed to load recruiter performance data' }, { status: 500 })
  }
}
