import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { PrintButton } from './PrintButton'
import { db } from '@/lib/db'
import { isCandidateInactive } from '@/lib/candidate-status'
import { renderPipelineHtml } from '@/lib/pipeline-report'
import type { PipelineReportData } from '@/lib/pipeline-report'
import type { Stage, SourceType, InterviewDecision, Role } from '@prisma/client'

const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Pipeline', SCREENING: 'Screening', TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview', CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected', WITHDRAWN: 'On Hold',
}
const STAGE_ORDER: Stage[] = ['HIRED', 'OFFER', 'CLIENT_INTERVIEW', 'MANAGER_INTERVIEW', 'TECHNICAL_INTERVIEW', 'SCREENING', 'APPLIED']
const DECISION_LABELS: Record<InterviewDecision, string> = { ADVANCE: 'Advance', REJECT: 'Reject', HOLD: 'Hold' }

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

async function buildReportData(fromDate: Date, toDate: Date): Promise<PipelineReportData> {
  const now = new Date()
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setUTCHours(23, 59, 59, 999)

  const positions = await db.position.findMany({
    where: { status: 'OPEN', deletedAt: null },
    include: {
      recruiter: { select: { name: true, email: true } },
      candidatePositions: {
        where: { candidate: { deletedAt: null } },
        include: {
          candidate: { select: { firstName: true, lastName: true, sourcedByType: true } },
          stageHistory: { orderBy: { movedAt: 'asc' } },
          interviews: {
            where: { decision: { not: null } },
            select: { stage: true, decision: true, decidedAt: true, decisionNotes: true },
            orderBy: { decidedAt: 'desc' },
          },
        },
      },
    },
    orderBy: [{ client: 'asc' }, { title: 'asc' }],
  })

  const byClient = new Map<string, typeof positions>()
  for (const pos of positions) {
    if (!byClient.has(pos.client)) byClient.set(pos.client, [])
    byClient.get(pos.client)!.push(pos)
  }

  let totalPositions = 0, totalActive = 0, totalHeadcount = 0
  let offerCount = 0, clientCount = 0, managerCount = 0, techCount = 0

  const clients = [...byClient.entries()].map(([clientName, clientPositions]) => ({
    client: clientName,
    positions: clientPositions.map((pos) => {
      totalPositions++
      totalHeadcount += pos.headcount ?? 1
      const activeCPs = pos.candidatePositions.filter((cp) => !isCandidateInactive(cp))
      totalActive += activeCPs.length

      const stageCounts = new Map<Stage, { cpId: string; name: string; days: number }[]>()
      for (const cp of activeCPs) {
        const s = cp.stage as Stage
        if (!STAGE_ORDER.includes(s)) continue
        const entry = [...cp.stageHistory].reverse().find((h) => h.toStage === s)
        const days = entry ? daysAgo(entry.movedAt) : daysAgo(cp.createdAt)
        if (!stageCounts.has(s)) stageCounts.set(s, [])
        stageCounts.get(s)!.push({ cpId: cp.id, name: `${cp.candidate.firstName} ${cp.candidate.lastName.charAt(0)}.`, days })

        if (s === 'OFFER') offerCount++
        else if (s === 'CLIENT_INTERVIEW') clientCount++
        else if (s === 'MANAGER_INTERVIEW') managerCount++
        else if (s === 'TECHNICAL_INTERVIEW') techCount++
      }

      const pipelineStages = STAGE_ORDER.filter((s) => stageCounts.has(s)).map((s) => ({
        stage: s, label: STAGE_LABELS[s], count: stageCounts.get(s)!.length, candidates: stageCounts.get(s)!,
      }))

      const newCandidates: { name: string; source: string }[] = []
      const stageChanges: { name: string; from: string; to: string }[] = []
      const decisions: { name: string; decision: string; stage: string; notes: string | null }[] = []

      for (const cp of pos.candidatePositions) {
        const name = `${cp.candidate.firstName} ${cp.candidate.lastName}`
        if (cp.createdAt >= fromDate && cp.createdAt <= toDate)
          newCandidates.push({ name, source: sourceLabel(cp.candidate.sourcedByType) })
        for (const h of cp.stageHistory)
          if (h.movedAt >= fromDate && h.movedAt <= toDate && h.fromStage && h.fromStage !== h.toStage)
            stageChanges.push({ name, from: STAGE_LABELS[h.fromStage as Stage] ?? h.fromStage, to: STAGE_LABELS[h.toStage as Stage] ?? h.toStage })
        for (const iv of cp.interviews)
          if (iv.decidedAt && iv.decidedAt >= fromDate && iv.decidedAt <= toDate)
            decisions.push({ name, decision: DECISION_LABELS[iv.decision!] ?? iv.decision!, stage: STAGE_LABELS[iv.stage as Stage] ?? iv.stage, notes: iv.decisionNotes ?? null })
      }

      const nmf = pos.candidatePositions.filter((cp) => cp.status === 'REJECTED' || cp.status === 'WITHDRAWN').length
      return { id: pos.id, title: pos.title, recruiter: pos.recruiter.name ?? pos.recruiter.email, headcount: pos.headcount ?? 1, pipelineStages, activity: { newCandidates, stageChanges, decisions }, notMovingForward: nmf, totalProcessed: activeCPs.length + nmf }
    }),
  }))

  const [interviewsToday, conductedInterviews, advancedCount, newCPsRaw, movedToOfferCount, rejectedCount] = await Promise.all([
    db.interview.count({
      where: { scheduledAt: { gte: todayStart, lte: todayEnd }, candidatePosition: { status: { in: ['ACTIVE', 'HIRED'] }, position: { status: 'OPEN', deletedAt: null }, candidate: { deletedAt: null } } },
    }),
    db.interview.findMany({
      where: { scheduledAt: { gte: fromDate, lte: toDate }, candidatePosition: { status: { in: ['ACTIVE', 'HIRED'] }, position: { status: 'OPEN', deletedAt: null }, candidate: { deletedAt: null } } },
      select: { stage: true },
    }),
    db.interview.count({
      where: { decidedAt: { gte: fromDate, lte: toDate }, decision: 'ADVANCE', candidatePosition: { status: { in: ['ACTIVE', 'HIRED'] }, position: { status: 'OPEN', deletedAt: null }, candidate: { deletedAt: null } } },
    }),
    db.candidatePosition.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate }, position: { status: 'OPEN', deletedAt: null }, candidate: { deletedAt: null } },
      select: { positionId: true },
    }),
    db.stageHistory.count({
      where: { toStage: 'OFFER', movedAt: { gte: fromDate, lte: toDate }, candidatePosition: { position: { status: 'OPEN', deletedAt: null }, candidate: { deletedAt: null } } },
    }),
    db.interview.count({
      where: { decidedAt: { gte: fromDate, lte: toDate }, decision: 'REJECT', candidatePosition: { position: { status: 'OPEN', deletedAt: null }, candidate: { deletedAt: null } } },
    }),
  ])

  const INTERVIEW_STAGE_LABELS: Partial<Record<string, string>> = {
    SCREENING: 'screening', TECHNICAL_INTERVIEW: 'technical',
    MANAGER_INTERVIEW: 'manager', CLIENT_INTERVIEW: 'client',
  }
  const stageBuckets: Record<string, number> = {}
  for (const iv of conductedInterviews) {
    const label = INTERVIEW_STAGE_LABELS[iv.stage] ?? iv.stage.toLowerCase()
    stageBuckets[label] = (stageBuckets[label] ?? 0) + 1
  }
  const interviewsByStage = Object.entries(stageBuckets).map(([label, count]) => ({ stage: label, label, count }))
  const newCPPositionIds = new Set(newCPsRaw.map((cp) => cp.positionId))

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    generatedAt: now.toISOString(),
    summary: { totalPositions, totalActive, totalHeadcount, interviewsToday },
    atAGlance: { openPositions: totalPositions, totalHeadcount, activeCandidates: totalActive, offerCount, clientCount, managerCount, techCount, interviewsToday },
    periodHighlights: { interviewsConducted: conductedInterviews.length, interviewsByStage, candidatesAdvanced: advancedCount, newCandidates: newCPsRaw.length, newCandidatePositions: newCPPositionIds.size, movedToOffer: movedToOfferCount, notMovingForward: rejectedCount },
    clients,
  }
}

export default async function PrintPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if ((session.user as { role?: Role }).role !== 'ADMIN') redirect('/reports')

  const { from, to } = await searchParams
  const now = new Date()
  const defaultFrom = new Date(now); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 6); defaultFrom.setUTCHours(0, 0, 0, 0)
  const defaultTo = new Date(now); defaultTo.setUTCHours(23, 59, 59, 999)

  const fromDate = from ? new Date(from) : defaultFrom
  const toDate = to ? new Date(to) : defaultTo

  const data = await buildReportData(fromDate, toDate)
  const html = renderPipelineHtml(data, { printMode: true })

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
        body { margin: 0; font-family: sans-serif; }
      `}</style>
      <div className="no-print" style={{ padding: '12px 16px', background: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e5e7eb' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Pipeline Report — Tenarai LATAM</span>
        <PrintButton />
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}
