import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isCandidateInactive } from '@/lib/candidate-status'
import type { Stage, InterviewDecision, SourceType } from '@prisma/client'

const STAGE_SEQUENCE: Stage[] = [
  'APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED',
]

const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Pipeline',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'On Hold',
}

const DECISION_LABELS: Record<InterviewDecision, string> = {
  ADVANCE: 'Advance',
  REJECT: 'Reject',
  HOLD: 'Hold',
}

function daysAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function sourceLabel(type: SourceType | null): string {
  if (type === 'VENDOR') return 'Partner'
  if (type === 'RECRUITER') return 'Internal'
  if (type === 'OTHER') return 'Direct'
  return 'Internal'
}

const STAGE_ABBREV: Partial<Record<Stage, string>> = {
  SCREENING: 'Screen',
  TECHNICAL_INTERVIEW: 'Tech',
  MANAGER_INTERVIEW: 'Manager',
  CLIENT_INTERVIEW: 'Client',
  OFFER: 'Offer',
}

// GET /api/reports/account-status?client=CLIENT_NAME[&mode=activity&from=ISO&to=ISO]
// Returns list of unique clients when client param is omitted
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const client = searchParams.get('client')
  const mode = searchParams.get('mode') // 'pipeline' (default) | 'activity' | 'dashboard'

  // No client param → return list of unique clients
  if (!client) {
    const positions = await db.position.findMany({
      where: { deletedAt: null },
      select: { client: true },
      distinct: ['client'],
      orderBy: { client: 'asc' },
    })
    return NextResponse.json({ clients: positions.map((p) => p.client) })
  }

  // Dashboard mode
  if (mode === 'dashboard') {
    // Build UTC date boundaries for "today" using explicit UTC field setters
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd   = new Date(); todayEnd.setUTCHours(23, 59, 59, 999)

    const DASH_STAGES: Stage[] = ['HIRED', 'OFFER', 'CLIENT_INTERVIEW', 'MANAGER_INTERVIEW', 'TECHNICAL_INTERVIEW', 'SCREENING', 'APPLIED']

    const positions = await db.position.findMany({
      where: { client, deletedAt: null },
      include: {
        recruiter: { select: { name: true, email: true } },
        candidatePositions: {
          where: { candidate: { deletedAt: null } },
          include: {
            candidate: { select: { firstName: true, lastName: true } },
            stageHistory: { orderBy: { movedAt: 'desc' } },
            interviews: {
              where: { scheduledAt: { not: null }, status: { in: ['SCHEDULED', 'COMPLETED'] } },
              select: { stage: true, status: true, scheduledAt: true, decision: true },
            },
          },
        },
      },
      orderBy: { title: 'asc' },
    })

    const now = new Date()

    const result = positions.map((pos) => {
      const allCPs = pos.candidatePositions
      const activeCPs = allCPs.filter((cp) => !isCandidateInactive(cp))

      // Stage counts (active only, relevant stages)
      const stageCounts: Partial<Record<string, number>> = {}
      for (const cp of activeCPs) {
        if (DASH_STAGES.includes(cp.stage as Stage)) {
          stageCounts[cp.stage] = (stageCounts[cp.stage] ?? 0) + 1
        }
      }

      // Interview counts — active candidates only, today's date window (UTC), SCHEDULED or COMPLETED
      const activeInterviews = activeCPs.flatMap((cp) => cp.interviews)
      const interviewsToday = activeInterviews.filter((iv) =>
        iv.scheduledAt! >= todayStart && iv.scheduledAt! <= todayEnd
      ).length
      const interviewsTotal = activeInterviews.filter((iv) => iv.scheduledAt! >= now).length

      // Candidates by stage with their next upcoming SCHEDULED interview
      const candidatesByStage = DASH_STAGES
        .filter((s) => stageCounts[s])
        .map((s) => ({
          stage: s,
          label: STAGE_LABELS[s],
          candidates: activeCPs
            .filter((cp) => cp.stage === s)
            .map((cp) => {
              const entry = cp.stageHistory.find((h) => h.toStage === cp.stage)
              // Pick the soonest upcoming SCHEDULED interview for this candidate
              const nextIv = cp.interviews
                .filter((iv) => iv.status === 'SCHEDULED' && iv.scheduledAt! >= now)
                .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0] ?? null
              // Past SCHEDULED interview (from a previous day) with no decision = needs feedback
              const pastPendingIv = cp.interviews
                .filter((iv) => iv.status === 'SCHEDULED' && iv.scheduledAt! < now && iv.decision === null)
                .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0] ?? null
              const latestDecision = cp.interviews
                .filter((iv) => iv.decision !== null)
                .sort((a, b) => (b.scheduledAt?.getTime() ?? 0) - (a.scheduledAt?.getTime() ?? 0))[0]?.decision ?? null
              return {
                cpId: cp.id,
                name: `${cp.candidate.firstName} ${cp.candidate.lastName}`,
                daysInStage: entry ? daysAgo(entry.movedAt) : daysAgo(cp.createdAt),
                scheduledAt: nextIv?.scheduledAt?.toISOString() ?? null,
                scheduledStageLabel: nextIv ? (STAGE_ABBREV[nextIv.stage] ?? STAGE_LABELS[nextIv.stage] ?? nextIv.stage) : null,
                pendingIv: pastPendingIv ? {
                  scheduledAt: pastPendingIv.scheduledAt!.toISOString(),
                  stageLabel: STAGE_ABBREV[pastPendingIv.stage] ?? STAGE_LABELS[pastPendingIv.stage] ?? pastPendingIv.stage,
                } : null,
                onHold: latestDecision === 'HOLD',
              }
            }),
        }))

      return {
        id: pos.id,
        title: pos.title,
        recruiter: pos.recruiter.name ?? pos.recruiter.email,
        timezone: (pos as { timezone?: string | null }).timezone ?? 'America/Montevideo',
        stageCounts,
        interviewsToday,
        interviewsTotal,
        candidatesByStage,
      }
    })

    return NextResponse.json({ client, positions: result, generatedAt: new Date().toISOString() })
  }

  // Analytics mode — funnel snapshot + time-to-stage + time-in-stage
  if (mode === 'analytics') {
    const ANALYTICS_STAGES: Stage[] = ['APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER', 'HIRED']

    const positions = await db.position.findMany({
      where: { client, deletedAt: null },
      select: { id: true },
    })
    const positionIds = positions.map((p) => p.id)

    if (positionIds.length === 0) {
      return NextResponse.json({ client, funnel: [], timeToStage: [], timeInStage: [], generatedAt: new Date().toISOString() })
    }

    // 1. Funnel — current snapshot counts of active candidates per stage
    const cps = await db.candidatePosition.findMany({
      where: { positionId: { in: positionIds }, candidate: { deletedAt: null } },
      select: { stage: true, status: true },
    })
    const activeCps = cps.filter((cp) => !isCandidateInactive(cp))
    const stageCountMap = new Map<string, number>()
    for (const cp of activeCps) {
      stageCountMap.set(cp.stage, (stageCountMap.get(cp.stage) ?? 0) + 1)
    }
    const funnel = ANALYTICS_STAGES.map((stage, i) => {
      const count = stageCountMap.get(stage) ?? 0
      const prevCount = i > 0 ? (stageCountMap.get(ANALYTICS_STAGES[i - 1]) ?? 0) : null
      const conversionFromPrevious = prevCount != null && prevCount > 0
        ? Math.round((count / prevCount) * 100)
        : null
      return { stage, label: STAGE_LABELS[stage], count, conversionFromPrevious }
    })

    // 2+3. Time-to-stage and time-in-stage from StageHistory
    const histories = await db.stageHistory.findMany({
      where: { candidatePosition: { positionId: { in: positionIds } } },
      orderBy: { movedAt: 'asc' },
    })

    const byCp = new Map<string, typeof histories>()
    for (const h of histories) {
      if (!byCp.has(h.candidatePositionId)) byCp.set(h.candidatePositionId, [])
      byCp.get(h.candidatePositionId)!.push(h)
    }

    function msToDays(ms: number) { return ms / (1000 * 60 * 60 * 24) }
    function round1(n: number) { return Math.round(n * 10) / 10 }

    // Time to stage
    const ttsAccum = new Map<Stage, number[]>()
    ANALYTICS_STAGES.slice(1).forEach((s) => ttsAccum.set(s, []))
    for (const [, entries] of byCp) {
      const startEntry = entries.find((e) => e.toStage === 'APPLIED')
      if (!startEntry) continue
      const startMs = startEntry.movedAt.getTime()
      for (const stage of ANALYTICS_STAGES.slice(1)) {
        const reached = entries.find((e) => e.toStage === stage)
        if (reached) ttsAccum.get(stage)!.push(msToDays(reached.movedAt.getTime() - startMs))
      }
    }
    const timeToStage = ANALYTICS_STAGES.slice(1).map((stage) => {
      const days = ttsAccum.get(stage)!
      return { stage, label: STAGE_LABELS[stage], avgDays: days.length > 0 ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null, sampleSize: days.length }
    })

    // Time in stage
    const tisAccum = new Map<Stage, number[]>()
    ANALYTICS_STAGES.forEach((s) => tisAccum.set(s, []))
    for (const [, entries] of byCp) {
      for (let i = 0; i < entries.length - 1; i++) {
        const stage = entries[i].toStage as Stage
        if (tisAccum.has(stage)) {
          tisAccum.get(stage)!.push(msToDays(entries[i + 1].movedAt.getTime() - entries[i].movedAt.getTime()))
        }
      }
    }
    const timeInStage = ANALYTICS_STAGES.map((stage) => {
      const days = tisAccum.get(stage)!
      return { stage, label: STAGE_LABELS[stage], avgDays: days.length > 0 ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null, sampleSize: days.length }
    })

    return NextResponse.json({ client, funnel, timeToStage, timeInStage, generatedAt: new Date().toISOString() })
  }

  // Activity mode
  if (mode === 'activity') {
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const fromDate = fromParam ? new Date(fromParam) : new Date(new Date().setHours(0, 0, 0, 0))
    const toDate = toParam ? new Date(toParam) : new Date(new Date().setHours(23, 59, 59, 999))

    const positions = await db.position.findMany({
      where: { client, deletedAt: null },
      select: { id: true, title: true },
    })
    const positionIds = positions.map((p) => p.id)
    const posMap = new Map(positions.map((p) => [p.id, p.title]))

    if (positionIds.length === 0) {
      return NextResponse.json({ client, days: [], generatedAt: new Date().toISOString() })
    }

    const interviews = await db.interview.findMany({
      where: {
        candidatePosition: { positionId: { in: positionIds } },
        OR: [
          { scheduledAt: { gte: fromDate, lte: toDate } },
          { updatedAt: { gte: fromDate, lte: toDate } },
        ],
      },
      select: {
        id: true,
        stage: true,
        decision: true,
        decidedAt: true,
        updatedAt: true,
        scheduledAt: true,
        candidatePosition: { select: { positionId: true } },
      },
    })

    // Group by date (YYYY-MM-DD in UTC) then by positionId
    const dayMap = new Map<string, Map<string, {
      scheduledByStage: Map<string, number>
      decidedByKey: Map<string, { decision: string; stage: string; count: number }>
    }>>()

    for (const iv of interviews) {
      const posId = iv.candidatePosition.positionId
      const activityDates = new Set<string>()
      if (iv.scheduledAt) {
        const d = iv.scheduledAt.toISOString().slice(0, 10)
        if (iv.scheduledAt >= fromDate && iv.scheduledAt <= toDate) activityDates.add(d)
      }
      const updatedDay = iv.updatedAt.toISOString().slice(0, 10)
      if (iv.updatedAt >= fromDate && iv.updatedAt <= toDate) activityDates.add(updatedDay)

      for (const day of activityDates) {
        if (!dayMap.has(day)) dayMap.set(day, new Map())
        const posDay = dayMap.get(day)!
        if (!posDay.has(posId)) posDay.set(posId, { scheduledByStage: new Map(), decidedByKey: new Map() })
        const entry = posDay.get(posId)!

        if (iv.scheduledAt && iv.scheduledAt.toISOString().slice(0, 10) === day && iv.stage) {
          const abbrev = STAGE_ABBREV[iv.stage] ?? iv.stage
          entry.scheduledByStage.set(abbrev, (entry.scheduledByStage.get(abbrev) ?? 0) + 1)
        }

        if (iv.decision && iv.stage) {
          const decidedDay = (iv.decidedAt ?? iv.updatedAt).toISOString().slice(0, 10)
          if (decidedDay === day) {
            const stageAbbrev = STAGE_ABBREV[iv.stage] ?? iv.stage
            const key = `${iv.decision}|${stageAbbrev}`
            const existing = entry.decidedByKey.get(key)
            if (existing) {
              existing.count++
            } else {
              entry.decidedByKey.set(key, { decision: iv.decision, stage: stageAbbrev, count: 1 })
            }
          }
        }
      }
    }

    const days = [...dayMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, posMap2]) => ({
        date,
        positions: [...posMap2.entries()].map(([posId, entry]) => ({
          posId,
          title: posMap.get(posId) ?? posId,
          scheduled: [...entry.scheduledByStage.entries()].map(([stage, count]) => ({ stage, count })),
          decisions: [...entry.decidedByKey.values()],
        })),
      }))

    return NextResponse.json({ client, days, generatedAt: new Date().toISOString() })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const positions = await db.position.findMany({
    where: { client, deletedAt: null },
    include: {
      recruiter: { select: { name: true, email: true } },
      positionVendors: {
        include: { vendor: { select: { name: true } } },
      },
      candidatePositions: {
        where: { candidate: { deletedAt: null } },
        include: {
          candidate: {
            select: {
              firstName: true, lastName: true,
              sourcedByType: true,
            },
          },
          stageHistory: { orderBy: { movedAt: 'desc' } },
          interviews: {
            where: { decision: { not: null } },
            select: {
              stage: true, decision: true, decidedAt: true,
              roundLabel: true, decisionNotes: true,
            },
            orderBy: { decidedAt: 'desc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const result = positions.map((pos) => {
    const allCPs = pos.candidatePositions
    const activeCPs = allCPs.filter((cp) => !isCandidateInactive(cp))
    const inactiveCPs = allCPs.filter((cp) => isCandidateInactive(cp))

    const byStage = new Map<Stage, typeof allCPs>()
    for (const cp of activeCPs) {
      const arr = byStage.get(cp.stage) ?? []
      arr.push(cp)
      byStage.set(cp.stage, arr)
    }
    const pipeline = [...STAGE_SEQUENCE].reverse()
      .filter((s) => s !== 'REJECTED' && s !== 'WITHDRAWN' && byStage.has(s))
      .map((s) => ({
        stage: s,
        label: STAGE_LABELS[s],
        count: byStage.get(s)!.length,
        candidates: byStage.get(s)!.map((cp) => {
          const entryRecord = cp.stageHistory.find((h) => h.toStage === cp.stage)
          const days = entryRecord ? daysAgo(entryRecord.movedAt) : daysAgo(cp.createdAt)
          return {
            cpId: cp.id,
            name: `${cp.candidate.firstName} ${cp.candidate.lastName}`,
            daysInStage: days,
          }
        }),
      }))

    const newCandidates = activeCPs
      .filter((cp) => cp.createdAt >= sevenDaysAgo)
      .map((cp) => ({
        name: `${cp.candidate.firstName} ${cp.candidate.lastName}`,
        source: sourceLabel(cp.candidate.sourcedByType ?? null),
      }))

    const stageChanges: { name: string; from: string; to: string }[] = []
    for (const cp of allCPs) {
      const name = `${cp.candidate.firstName} ${cp.candidate.lastName}`
      for (const h of cp.stageHistory) {
        if (h.movedAt >= sevenDaysAgo && h.fromStage) {
          stageChanges.push({
            name,
            from: STAGE_LABELS[h.fromStage] ?? h.fromStage,
            to: STAGE_LABELS[h.toStage] ?? h.toStage,
          })
        }
      }
    }

    const decisions: { name: string; decision: string; roundLabel: string; notes: string | null }[] = []
    for (const cp of allCPs) {
      const name = `${cp.candidate.firstName} ${cp.candidate.lastName}`
      for (const iv of cp.interviews) {
        if (iv.decision && iv.decidedAt && iv.decidedAt >= sevenDaysAgo) {
          decisions.push({
            name,
            decision: DECISION_LABELS[iv.decision] ?? iv.decision,
            roundLabel: iv.roundLabel,
            notes: iv.decisionNotes ?? null,
          })
        }
      }
    }

    return {
      id: pos.id,
      title: pos.title,
      recruiter: pos.recruiter.name ?? pos.recruiter.email,
      vendorMinFitScore: pos.vendorMinFitScore,
      directMinFitScore: pos.directMinFitScore,
      partners: pos.positionVendors.map((pv) => pv.vendor.name),
      totalCandidates: allCPs.length,
      activeCandidates: activeCPs.length,
      notMovingForward: inactiveCPs.length,
      pipeline,
      movements: { newCandidates, stageChanges, decisions },
    }
  })

  const totalActive = result.reduce((sum, p) => sum + p.activeCandidates, 0)
  const totalNotMoving = result.reduce((sum, p) => sum + p.notMovingForward, 0)

  return NextResponse.json({
    client,
    totalPositions: positions.length,
    totalActive,
    totalNotMoving,
    positions: result,
    generatedAt: new Date().toISOString(),
  })
}
