import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isCandidateInactive } from '@/lib/candidate-status'
import type { Stage, SourceType, InterviewDecision } from '@prisma/client'

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

const STAGE_ORDER: Stage[] = [
  'OFFER', 'CLIENT_INTERVIEW', 'MANAGER_INTERVIEW', 'TECHNICAL_INTERVIEW', 'SCREENING', 'APPLIED',
]

const DECISION_LABELS: Record<InterviewDecision, string> = {
  ADVANCE: 'Advance',
  REJECT: 'Reject',
  HOLD: 'Hold',
}

function sourceLabel(type: SourceType | null | undefined): string {
  if (type === 'VENDOR') return 'Partner'
  if (type === 'RECRUITER') return 'Internal'
  if (type === 'DIRECT') return 'Direct'
  if (type === 'REFERRAL') return 'Referral'
  return 'Internal'
}

function daysAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function candidateInitial(firstName: string, lastName: string): string {
  return `${firstName} ${lastName.charAt(0)}.`
}

// GET /api/reports/pipeline?from=ISO&to=ISO
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  const now = new Date()
  const defaultFrom = new Date(now); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 7); defaultFrom.setUTCHours(0, 0, 0, 0)
  const defaultTo = new Date(now); defaultTo.setUTCHours(23, 59, 59, 999)

  const fromDate = fromParam ? new Date(fromParam) : defaultFrom
  const toDate = toParam ? new Date(toParam) : defaultTo

  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setUTCHours(23, 59, 59, 999)

  const positions = await db.position.findMany({
    where: { status: 'OPEN', deletedAt: null },
    include: {
      recruiter: { select: { name: true, email: true } },
      candidatePositions: {
        where: { candidate: { deletedAt: null } },
        include: {
          candidate: {
            select: { firstName: true, lastName: true, sourcedByType: true },
          },
          stageHistory: { orderBy: { movedAt: 'asc' } },
          interviews: {
            where: { decision: { not: null } },
            select: { stage: true, decision: true, decidedAt: true, decisionNotes: true, roundLabel: true },
            orderBy: { decidedAt: 'desc' },
          },
        },
      },
    },
    orderBy: [{ client: 'asc' }, { title: 'asc' }],
  })

  // Group by client
  const byClient = new Map<string, typeof positions>()
  for (const pos of positions) {
    if (!byClient.has(pos.client)) byClient.set(pos.client, [])
    byClient.get(pos.client)!.push(pos)
  }

  let totalPositions = 0
  let totalActive = 0
  let totalHeadcount = 0
  let interviewsToday = 0

  const clients = [...byClient.entries()].map(([clientName, clientPositions]) => {
    const positionData = clientPositions.map((pos) => {
      totalPositions++
      totalHeadcount += pos.headcount ?? 1

      const allCPs = pos.candidatePositions
      const activeCPs = allCPs.filter((cp) => !isCandidateInactive(cp))
      totalActive += activeCPs.length

      // Pipeline snapshot
      const stageCounts = new Map<Stage, { cpId: string; name: string; days: number }[]>()
      for (const cp of activeCPs) {
        const s = cp.stage as Stage
        if (!STAGE_ORDER.includes(s)) continue
        const entry = cp.stageHistory.slice().reverse().find((h) => h.toStage === s)
        const days = entry ? daysAgo(entry.movedAt) : daysAgo(cp.createdAt)
        if (!stageCounts.has(s)) stageCounts.set(s, [])
        stageCounts.get(s)!.push({ cpId: cp.id, name: candidateInitial(cp.candidate.firstName, cp.candidate.lastName), days })
      }

      const pipelineStages = STAGE_ORDER
        .filter((s) => stageCounts.has(s))
        .map((s) => ({
          stage: s,
          label: STAGE_LABELS[s],
          count: stageCounts.get(s)!.length,
          candidates: stageCounts.get(s)!,
        }))

      // Activity in date range
      const newCandidates: { name: string; source: string }[] = []
      const stageChanges: { name: string; from: string; to: string }[] = []
      const decisions: { name: string; decision: string; stage: string; notes: string | null }[] = []

      for (const cp of allCPs) {
        const name = `${cp.candidate.firstName} ${cp.candidate.lastName}`
        if (cp.createdAt >= fromDate && cp.createdAt <= toDate) {
          newCandidates.push({ name, source: sourceLabel(cp.candidate.sourcedByType) })
        }
        for (const h of cp.stageHistory) {
          if (h.movedAt >= fromDate && h.movedAt <= toDate && h.fromStage) {
            stageChanges.push({
              name,
              from: STAGE_LABELS[h.fromStage as Stage] ?? h.fromStage,
              to: STAGE_LABELS[h.toStage as Stage] ?? h.toStage,
            })
          }
        }
        for (const iv of cp.interviews) {
          const decidedAt = iv.decidedAt ?? null
          if (decidedAt && decidedAt >= fromDate && decidedAt <= toDate) {
            decisions.push({
              name,
              decision: DECISION_LABELS[iv.decision!] ?? iv.decision!,
              stage: STAGE_LABELS[iv.stage as Stage] ?? iv.stage,
              notes: iv.decisionNotes ?? null,
            })
          }
        }
      }

      // Interviews today (active candidates, SCHEDULED or COMPLETED)
      for (const cp of activeCPs) {
        for (const iv of cp.interviews) {
          // interviews relation only fetches decided ones — re-query not needed;
          // today count is added separately via a flat query below
        }
      }

      return {
        id: pos.id,
        title: pos.title,
        recruiter: pos.recruiter.name ?? pos.recruiter.email,
        headcount: pos.headcount ?? 1,
        pipelineStages,
        activity: { newCandidates, stageChanges, decisions },
      }
    })

    return { client: clientName, positions: positionData }
  })

  // Interviews today (separate flat query for accuracy)
  const todayInterviews = await db.interview.count({
    where: {
      scheduledAt: { gte: todayStart, lte: todayEnd },
      status: { in: ['SCHEDULED', 'COMPLETED'] },
      candidatePosition: {
        status: { in: ['ACTIVE', 'HIRED'] },
        position: { status: 'OPEN', deletedAt: null },
        candidate: { deletedAt: null },
      },
    },
  })
  interviewsToday = todayInterviews

  return NextResponse.json({
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    generatedAt: now.toISOString(),
    summary: { totalPositions, totalActive, totalHeadcount, interviewsToday },
    clients,
  })
}
