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

// GET /api/reports/account-status?client=CLIENT_NAME
// Returns list of unique clients when client param is omitted
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const client = searchParams.get('client')

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
