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
  APPLIED: 'Applied',
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
  const mode = searchParams.get('mode') // 'pipeline' (default) | 'activity'

  // No client param → return list of unique clients
  if (!client) {
    const positions = await db.position.findMany({
      where: { status: 'OPEN', deletedAt: null },
      select: { client: true },
      distinct: ['client'],
      orderBy: { client: 'asc' },
    })
    return NextResponse.json({ clients: positions.map((p) => p.client) })
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
      decidedByDecision: Map<string, number>
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
        if (!posDay.has(posId)) posDay.set(posId, { scheduledByStage: new Map(), decidedByDecision: new Map() })
        const entry = posDay.get(posId)!

        // Count scheduled (scheduledAt on this day)
        if (iv.scheduledAt && iv.scheduledAt.toISOString().slice(0, 10) === day && iv.stage) {
          const abbrev = STAGE_ABBREV[iv.stage] ?? iv.stage
          entry.scheduledByStage.set(abbrev, (entry.scheduledByStage.get(abbrev) ?? 0) + 1)
        }

        // Count decisions (decidedAt or updatedAt on this day, only when decision exists)
        if (iv.decision) {
          const decidedDay = (iv.decidedAt ?? iv.updatedAt).toISOString().slice(0, 10)
          if (decidedDay === day) {
            const dec = iv.decision
            entry.decidedByDecision.set(dec, (entry.decidedByDecision.get(dec) ?? 0) + 1)
          }
        }
      }
    }

    // Build sorted days (most recent first)
    const days = [...dayMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, posMap2]) => ({
        date,
        positions: [...posMap2.entries()].map(([posId, entry]) => ({
          posId,
          title: posMap.get(posId) ?? posId,
          scheduled: [...entry.scheduledByStage.entries()].map(([stage, count]) => ({ stage, count })),
          decisions: [...entry.decidedByDecision.entries()].map(([decision, count]) => ({ decision, count })),
        })),
      }))

    return NextResponse.json({ client, days, generatedAt: new Date().toISOString() })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const positions = await db.position.findMany({
    where: { client, status: 'OPEN', deletedAt: null },
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

    // Pipeline breakdown (most advanced first, skip REJECTED/WITHDRAWN)
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

    // Movements last 7 days
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
