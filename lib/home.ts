import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { db } from '@/lib/db'
import { elapsedBusinessDaysInTz } from '@/lib/business-days'
import { getTimeInStage } from '@/lib/analytics'
import {
  HOME_TIMEZONE, STALLED_AMBER_DAYS, STARTING_SOON_DAYS,
} from '@/lib/home-thresholds'

const DAY_MS = 86_400_000
const DEFAULT_TZ = 'America/Montevideo'

export const INTERNAL_PANEL_STAGES = ['SCREENING', 'TECHNICAL_INTERVIEW'] as const
export const CLIENT_PANEL_STAGES = ['MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER'] as const
export const SNAPSHOT_STAGES = ['OFFER', 'CLIENT_INTERVIEW', 'MANAGER_INTERVIEW', 'TECHNICAL_INTERVIEW', 'SCREENING', 'APPLIED'] as const
export const BOTTLENECK_STAGES = ['SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER'] as const

type PositionRef = { positionId: string; positionTitle: string; client: string; timezone: string }
type CandRef = PositionRef & { cpId: string; candidateName: string }

// ownerName: first name of the recruiter assigned to the candidate in this position
export interface WaitingItem extends CandRef { interviewId: string; stage: string; scheduledAt: string; businessDaysWaiting: number; ownerName: string | null }
export interface StalledItem extends CandRef { stage: string; daysInStage: number }
export interface StalledGroup extends PositionRef {
  count: number
  // stalled candidates per stage, most advanced stage first
  byStage: { stage: string; count: number }[]
  oldestDays: number
  candidates: StalledItem[]
}
export interface NewApplicationItem extends CandRef { source: 'VENDOR' | 'REFERRAL' | 'DIRECT'; daysSinceAdded: number }
export interface StartingSoonItem extends CandRef { startDate: string }
export interface TodayInterview extends CandRef { interviewId: string; stage: string; scheduledAt: string; done: boolean; isPast: boolean }
export interface SnapshotRow {
  positionId: string; title: string; client: string; headcount: number; hired: number
  stageCounts: Record<(typeof SNAPSHOT_STAGES)[number], number>
  oldestWaitBd: number | null
  // days since the oldest ACTIVE candidate still in APPLIED was added
  pipeAgeDays: number | null
  // HIRED candidates >= headcount: no pending actions; listed muted at the bottom of its client
  fulfilled: boolean
}
export interface BottleneckRow {
  stage: string
  active: number
  // average days the current candidates have been in this stage so far
  avgDays: number | null
  overThreshold: number
  // historical average of completed stays, same calculation as /reports "Time in Stage"
  typicalDays: number | null
  // 'amber' when avgDays exceeds typical, 'red' when 50%+ above it
  vsTypical: 'amber' | 'red' | null
}

export interface HomeData {
  today: { label: string; isoDate: string }
  counters: { openHeadcount: number; activeCandidates: number; interviewsToday: number; feedbackPending: number; noNextStep: number }
  waiting: { internal: WaitingItem[]; client: WaitingItem[] }
  stalled: StalledGroup[]
  newApplications: NewApplicationItem[]
  startingSoon: StartingSoonItem[]
  todayInterviews: TodayInterview[]
  snapshot: { client: string; positions: SnapshotRow[] }[]
  bottlenecks: BottleneckRow[]
}

export async function getHomeData(now = new Date()): Promise<HomeData> {
  // "Today" is the calendar day in Montevideo
  const todayYmd = formatInTimeZone(now, HOME_TIMEZONE, 'yyyy-MM-dd')
  const todayStart = fromZonedTime(`${todayYmd}T00:00:00`, HOME_TIMEZONE)
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS)
  const soonEnd = new Date(todayStart.getTime() + (STARTING_SOON_DAYS + 1) * DAY_MS)

  const [positions, hiredSoon, timeInStage] = await Promise.all([
    db.position.findMany({
      where: { deletedAt: null, type: 'REQUISITION', status: 'OPEN' },
      select: {
        id: true, title: true, client: true, headcount: true, timezone: true,
        candidatePositions: {
          where: { candidate: { deletedAt: null } },
          select: {
            id: true, stage: true, status: true, stageEnteredAt: true, createdAt: true,
            candidate: { select: { firstName: true, lastName: true, sourcedByType: true } },
            recruiter: { select: { name: true } },
            stageHistory: { orderBy: { movedAt: 'desc' }, take: 1, select: { movedAt: true } },
            interviews: {
              where: { status: { not: 'CANCELLED' } },
              select: { id: true, stage: true, scheduledAt: true, decision: true },
            },
          },
        },
      },
      orderBy: [{ client: 'asc' }, { title: 'asc' }],
    }),
    // Hired candidates often sit on FILLED positions, so this window includes OPEN and FILLED requisitions
    db.candidatePosition.findMany({
      where: {
        status: 'HIRED',
        startDate: { gte: todayStart, lt: soonEnd },
        candidate: { deletedAt: null },
        position: { deletedAt: null, type: 'REQUISITION', status: { in: ['OPEN', 'FILLED'] } },
      },
      select: {
        id: true, startDate: true,
        candidate: { select: { firstName: true, lastName: true } },
        position: { select: { id: true, title: true, client: true, timezone: true } },
      },
      orderBy: { startDate: 'asc' },
    }),
    getTimeInStage(),
  ])

  const waitingInternal: WaitingItem[] = []
  const waitingClient: WaitingItem[] = []
  const stalled: StalledItem[] = []
  const newApplications: NewApplicationItem[] = []
  const todayInterviews: TodayInterview[] = []
  const snapshotRows: SnapshotRow[] = []
  const bottleneckDays = new Map<string, number[]>(BOTTLENECK_STAGES.map((s) => [s, []]))
  let openHeadcount = 0
  let activeCandidates = 0

  for (const p of positions) {
    const timezone = p.timezone ?? DEFAULT_TZ
    const posRef: PositionRef = { positionId: p.id, positionTitle: p.title, client: p.client, timezone }
    const headcount = p.headcount ?? 1
    openHeadcount += headcount
    const stageCounts = Object.fromEntries(SNAPSHOT_STAGES.map((s) => [s, 0])) as SnapshotRow['stageCounts']
    const hired = p.candidatePositions.filter((cp) => cp.status === 'HIRED' || cp.stage === 'HIRED').length
    // Fulfilled positions are left out of the pending-action sections (feedback, no next step,
    // new applications, bottlenecks); today's interviews and starting soon still include them
    const fulfilled = hired >= headcount
    let oldestWaitBd: number | null = null
    let pipeAgeDays: number | null = null

    for (const cp of p.candidatePositions) {
      const ref: CandRef = { ...posRef, cpId: cp.id, candidateName: `${cp.candidate.firstName} ${cp.candidate.lastName}`.trim() }

      // Today's interviews include every candidate status, so ones decided today still show as done
      for (const iv of cp.interviews) {
        if (iv.scheduledAt && iv.scheduledAt >= todayStart && iv.scheduledAt < tomorrowStart) {
          todayInterviews.push({
            ...ref, interviewId: iv.id, stage: iv.stage, scheduledAt: iv.scheduledAt.toISOString(),
            done: iv.decision != null, isPast: iv.scheduledAt < now,
          })
        }
      }

      if (cp.status !== 'ACTIVE') continue
      activeCandidates++
      if ((SNAPSHOT_STAGES as readonly string[]).includes(cp.stage)) stageCounts[cp.stage as keyof typeof stageCounts]++
      if (fulfilled) continue
      if (cp.stage === 'APPLIED') {
        const age = Math.max(0, Math.floor((now.getTime() - cp.createdAt.getTime()) / DAY_MS))
        pipeAgeDays = Math.max(pipeAgeDays ?? 0, age)
      }

      // (a) Waiting for a decision: interviews before today with no decision
      let waitingForThisCp = false
      for (const iv of cp.interviews) {
        if (!iv.scheduledAt || iv.scheduledAt >= todayStart || iv.decision != null) continue
        const internal = (INTERNAL_PANEL_STAGES as readonly string[]).includes(iv.stage)
        const client = (CLIENT_PANEL_STAGES as readonly string[]).includes(iv.stage)
        if (!internal && !client) continue
        const bd = elapsedBusinessDaysInTz(iv.scheduledAt, now, HOME_TIMEZONE)
        const item: WaitingItem = {
          ...ref, interviewId: iv.id, stage: iv.stage, scheduledAt: iv.scheduledAt.toISOString(),
          businessDaysWaiting: bd, ownerName: cp.recruiter.name?.trim().split(/\s+/)[0] ?? null,
        }
        ;(internal ? waitingInternal : waitingClient).push(item)
        waitingForThisCp = true
        oldestWaitBd = Math.max(oldestWaitBd ?? 0, bd)
      }

      // Days in the current stage: latest stage move, falling back to stageEnteredAt
      const enteredAt = cp.stageHistory[0]?.movedAt ?? cp.stageEnteredAt
      const daysInStage = Math.max(0, Math.floor((now.getTime() - enteredAt.getTime()) / DAY_MS))
      bottleneckDays.get(cp.stage)?.push(daysInStage)

      // (b) Stalled: past Pipeline, long in stage, nothing scheduled ahead, not already waiting for a decision
      const hasFutureInterview = cp.interviews.some((iv) => iv.scheduledAt && iv.scheduledAt > now)
      if (cp.stage !== 'APPLIED' && !waitingForThisCp && daysInStage >= STALLED_AMBER_DAYS && !hasFutureInterview) {
        stalled.push({ ...ref, stage: cp.stage, daysInStage })
      }

      // (c) New applications not reviewed: partner, referral or direct candidates still in APPLIED
      const source = cp.candidate.sourcedByType
      if (cp.stage === 'APPLIED' && (source === 'VENDOR' || source === 'REFERRAL' || source === 'DIRECT')) {
        newApplications.push({ ...ref, source, daysSinceAdded: Math.max(0, Math.floor((now.getTime() - cp.createdAt.getTime()) / DAY_MS)) })
      }
    }

    snapshotRows.push({ positionId: p.id, title: p.title, client: p.client, headcount, hired, stageCounts, oldestWaitBd, pipeAgeDays, fulfilled })
  }

  const startingSoon: StartingSoonItem[] = hiredSoon.map((cp) => ({
    positionId: cp.position.id, positionTitle: cp.position.title, client: cp.position.client,
    timezone: cp.position.timezone ?? DEFAULT_TZ, cpId: cp.id,
    candidateName: `${cp.candidate.firstName} ${cp.candidate.lastName}`.trim(),
    startDate: cp.startDate!.toISOString(),
  }))

  waitingInternal.sort((a, b) => b.businessDaysWaiting - a.businessDaysWaiting)
  waitingClient.sort((a, b) => b.businessDaysWaiting - a.businessDaysWaiting)
  stalled.sort((a, b) => b.daysInStage - a.daysInStage)
  const stalledByPosition = new Map<string, StalledItem[]>()
  for (const s of stalled) stalledByPosition.set(s.positionId, [...(stalledByPosition.get(s.positionId) ?? []), s])
  const stageOrder = (st: string) => -SNAPSHOT_STAGES.indexOf(st as (typeof SNAPSHOT_STAGES)[number])
  const stalledGroups: StalledGroup[] = [...stalledByPosition.values()].map((items) => {
    const counts = new Map<string, number>()
    for (const i of items) counts.set(i.stage, (counts.get(i.stage) ?? 0) + 1)
    const { positionId, positionTitle, client, timezone } = items[0]
    return {
      positionId, positionTitle, client, timezone,
      count: items.length,
      byStage: [...counts.entries()].map(([stage, count]) => ({ stage, count })).sort((a, b) => stageOrder(b.stage) - stageOrder(a.stage)),
      oldestDays: items[0].daysInStage,
      candidates: items,
    }
  }).sort((a, b) => b.oldestDays - a.oldestDays)
  newApplications.sort((a, b) => b.daysSinceAdded - a.daysSinceAdded)
  todayInterviews.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))

  const byClient = new Map<string, SnapshotRow[]>()
  for (const r of snapshotRows) byClient.set(r.client, [...(byClient.get(r.client) ?? []), r])
  // Fulfilled positions go to the bottom of their client group (stable, so title order is kept)
  for (const [client, rows] of byClient) byClient.set(client, [...rows.filter((r) => !r.fulfilled), ...rows.filter((r) => r.fulfilled)])

  const typicalByStage = new Map(timeInStage.map((t) => [t.stage as string, t.sampleSize > 0 ? t.avgDays : null]))
  const bottlenecks: BottleneckRow[] = BOTTLENECK_STAGES.map((stage) => {
    const days = bottleneckDays.get(stage) ?? []
    const avgDays = days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null
    const typicalDays = typicalByStage.get(stage) ?? null
    const vsTypical = avgDays != null && typicalDays != null && typicalDays > 0 && avgDays > typicalDays
      ? (avgDays >= typicalDays * 1.5 ? 'red' : 'amber')
      : null
    return {
      stage,
      active: days.length,
      avgDays,
      overThreshold: days.filter((d) => d >= STALLED_AMBER_DAYS).length,
      typicalDays,
      vsTypical,
    }
  })


  return {
    today: { label: formatInTimeZone(now, HOME_TIMEZONE, 'EEEE, MMMM d'), isoDate: todayYmd },
    counters: {
      openHeadcount, activeCandidates, interviewsToday: todayInterviews.length,
      feedbackPending: waitingInternal.length + waitingClient.length,
      noNextStep: stalled.length,
    },
    waiting: { internal: waitingInternal, client: waitingClient },
    stalled: stalledGroups,
    newApplications,
    startingSoon,
    todayInterviews,
    snapshot: [...byClient.entries()].map(([client, rows]) => ({ client, positions: rows })),
    bottlenecks,
  }
}
