import { db } from './db'

export type PipelineStage = 'APPLIED' | 'SCREENING' | 'TECHNICAL_INTERVIEW' | 'MANAGER_INTERVIEW' | 'CLIENT_INTERVIEW' | 'OFFER' | 'HIRED'

export const PIPELINE_STAGES: PipelineStage[] = [
  'APPLIED',
  'SCREENING',
  'TECHNICAL_INTERVIEW',
  'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW',
  'OFFER',
  'HIRED',
]

export type TimeToStageResult = {
  stage: PipelineStage
  avgDays: number
  sampleSize: number
}

export type TimeInStageResult = {
  stage: PipelineStage
  avgDays: number
  sampleSize: number
}

export type LeadTimeResult = {
  avgDays: number | null
  sampleSize: number
  positionLeadTime?: number | null
}

export type FunnelStage = {
  stage: PipelineStage
  count: number
  conversionFromPrevious: number | null
}

function msToDays(ms: number): number {
  return ms / (1000 * 60 * 60 * 24)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export async function getTimeToStage(positionId?: string): Promise<TimeToStageResult[]> {
  const histories = await db.stageHistory.findMany({
    where: positionId
      ? { candidatePosition: { positionId } }
      : undefined,
    orderBy: { movedAt: 'asc' },
    include: { candidatePosition: { select: { id: true } } },
  })

  // Group by candidatePositionId
  const byCp = new Map<string, typeof histories>()
  for (const h of histories) {
    const cpId = h.candidatePositionId
    if (!byCp.has(cpId)) byCp.set(cpId, [])
    byCp.get(cpId)!.push(h)
  }

  const stagesAfterApplied = PIPELINE_STAGES.slice(1) // SCREENING..HIRED
  const stageDaysAccum = new Map<PipelineStage, number[]>()
  stagesAfterApplied.forEach((s) => stageDaysAccum.set(s, []))

  for (const [, entries] of byCp) {
    const startEntry = entries.find((e) => e.toStage === 'APPLIED')
    if (!startEntry) continue
    const startMs = startEntry.movedAt.getTime()

    for (const stage of stagesAfterApplied) {
      const reached = entries.find((e) => e.toStage === stage)
      if (reached) {
        stageDaysAccum.get(stage)!.push(msToDays(reached.movedAt.getTime() - startMs))
      }
    }
  }

  return stagesAfterApplied.map((stage) => {
    const days = stageDaysAccum.get(stage)!
    const sampleSize = days.length
    const avgDays = sampleSize > 0 ? round1(days.reduce((a, b) => a + b, 0) / sampleSize) : 0
    return { stage, avgDays, sampleSize }
  })
}

export async function getTimeInStage(positionId?: string): Promise<TimeInStageResult[]> {
  const histories = await db.stageHistory.findMany({
    where: positionId
      ? { candidatePosition: { positionId } }
      : undefined,
    orderBy: { movedAt: 'asc' },
  })

  // Group by candidatePositionId
  const byCp = new Map<string, typeof histories>()
  for (const h of histories) {
    const cpId = h.candidatePositionId
    if (!byCp.has(cpId)) byCp.set(cpId, [])
    byCp.get(cpId)!.push(h)
  }

  const stageDaysAccum = new Map<PipelineStage, number[]>()
  PIPELINE_STAGES.forEach((s) => stageDaysAccum.set(s, []))

  for (const [, entries] of byCp) {
    for (let i = 0; i < entries.length - 1; i++) {
      const current = entries[i]
      const next = entries[i + 1]
      const stage = current.toStage as PipelineStage
      if (stageDaysAccum.has(stage)) {
        const days = msToDays(next.movedAt.getTime() - current.movedAt.getTime())
        stageDaysAccum.get(stage)!.push(days)
      }
    }
  }

  return PIPELINE_STAGES.map((stage) => {
    const days = stageDaysAccum.get(stage)!
    const sampleSize = days.length
    const avgDays = sampleSize > 0 ? round1(days.reduce((a, b) => a + b, 0) / sampleSize) : 0
    return { stage, avgDays, sampleSize }
  })
}

export async function getLeadTime(positionId?: string): Promise<LeadTimeResult> {
  if (positionId) {
    const position = await db.position.findFirst({
      where: { id: positionId, deletedAt: null },
      select: { createdAt: true, status: true, updatedAt: true },
    })
    if (!position) return { avgDays: null, sampleSize: 0, positionLeadTime: null }

    const isClosed = position.status === 'FILLED' || position.status === 'CLOSED'
    const positionLeadTime = isClosed
      ? round1(msToDays(position.updatedAt.getTime() - position.createdAt.getTime()))
      : null

    return { avgDays: positionLeadTime, sampleSize: isClosed ? 1 : 0, positionLeadTime }
  }

  // Org-wide: all filled/closed positions
  const positions = await db.position.findMany({
    where: { deletedAt: null, status: { in: ['FILLED', 'CLOSED'] } },
    select: { createdAt: true, updatedAt: true },
  })

  if (positions.length === 0) return { avgDays: null, sampleSize: 0 }

  const days = positions.map((p) => msToDays(p.updatedAt.getTime() - p.createdAt.getTime()))
  const avgDays = round1(days.reduce((a, b) => a + b, 0) / days.length)
  return { avgDays, sampleSize: positions.length }
}

export async function getFunnelData(positionId?: string): Promise<FunnelStage[]> {
  // Count distinct CandidatePositions that ever reached each stage
  const counts = await Promise.all(
    PIPELINE_STAGES.map(async (stage) => {
      const count = await db.stageHistory.groupBy({
        by: ['candidatePositionId'],
        where: {
          toStage: stage,
          ...(positionId ? { candidatePosition: { positionId } } : {}),
        },
      })
      return { stage, count: count.length }
    })
  )

  return counts.map((item, i) => ({
    stage: item.stage,
    count: item.count,
    conversionFromPrevious:
      i === 0 || counts[i - 1].count === 0
        ? null
        : round1((item.count / counts[i - 1].count) * 100),
  }))
}
