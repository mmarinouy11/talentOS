import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { db } from '@/lib/db'
import { elapsedBusinessDaysInTz } from '@/lib/business-days'
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

export interface WaitingItem extends CandRef { interviewId: string; stage: string; scheduledAt: string; businessDaysWaiting: number; interviewerEmail: string | null }
export interface StalledItem extends CandRef { stage: string; daysInStage: number }
export interface NewApplicationItem extends CandRef { source: 'VENDOR' | 'REFERRAL' | 'DIRECT'; daysSinceAdded: number }
export interface StartingSoonItem extends CandRef { startDate: string }
export interface TodayInterview extends CandRef { interviewId: string; stage: string; scheduledAt: string; interviewerEmail: string | null; done: boolean; isPast: boolean }
export interface SnapshotRow {
  positionId: string; title: string; client: string; headcount: number; hired: number
  stageCounts: Record<(typeof SNAPSHOT_STAGES)[number], number>
  oldestWaitBd: number | null
}
export interface BottleneckRow { stage: string; active: number; avgDays: number | null; overThreshold: number }

export interface HomeData {
  today: { label: string; isoDate: string }
  counters: { openHeadcount: number; activeCandidates: number; interviewsToday: number; needsAttention: number }
  waiting: { internal: WaitingItem[]; client: WaitingItem[] }
  stalled: StalledItem[]
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

  const [positions, hiredSoon] = await Promise.all([
    db.position.findMany({
      where: { deletedAt: null, type: 'REQUISITION', status: 'OPEN' },
      select: {
        id: true, title: true, client: true, headcount: true, timezone: true,
        candidatePositions: {
          where: { candidate: { deletedAt: null } },
          select: {
            id: true, stage: true, status: true, stageEnteredAt: true, createdAt: true,
            candidate: { select: { firstName: true, lastName: true, sourcedByType: true } },
            stageHistory: { orderBy: { movedAt: 'desc' }, take: 1, select: { movedAt: true } },
            interviews: {
              where: { status: { not: 'CANCELLED' } },
              select: { id: true, stage: true, scheduledAt: true, decision: true, interviewerEmail: true },
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
    let hired = 0
    let oldestWaitBd: number | null = null

    for (const cp of p.candidatePositions) {
      const ref: CandRef = { ...posRef, cpId: cp.id, candidateName: `${cp.candidate.firstName} ${cp.candidate.lastName}`.trim() }
      if (cp.status === 'HIRED' || cp.stage === 'HIRED') hired++

      // Today's interviews include every candidate status, so ones decided today still show as done
      for (const iv of cp.interviews) {
        if (iv.scheduledAt && iv.scheduledAt >= todayStart && iv.scheduledAt < tomorrowStart) {
          todayInterviews.push({
            ...ref, interviewId: iv.id, stage: iv.stage, scheduledAt: iv.scheduledAt.toISOString(),
            interviewerEmail: iv.interviewerEmail, done: iv.decision != null, isPast: iv.scheduledAt < now,
          })
        }
      }

      if (cp.status !== 'ACTIVE') continue
      activeCandidates++
      if ((SNAPSHOT_STAGES as readonly string[]).includes(cp.stage)) stageCounts[cp.stage as keyof typeof stageCounts]++

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
          businessDaysWaiting: bd, interviewerEmail: iv.interviewerEmail,
        }
        ;(internal ? waitingInternal : waitingClient).push(item)
        waitingForThisCp = true
        oldestWaitBd = Math.max(oldestWaitBd ?? 0, bd)
      }

      // Days in the current stage: latest stage move, falling back to stageEnteredAt
      const enteredAt = cp.stageHistory[0]?.movedAt ?? cp.stageEnteredAt
      const daysInStage = Math.max(0, Math.floor((now.getTime() - enteredAt.getTime()) / DAY_MS))
      bottleneckDays.get(cp.stage)?.push(daysInStage)

      // (b) Stalled: long in stage, nothing scheduled ahead, not already waiting for a decision
      const hasFutureInterview = cp.interviews.some((iv) => iv.scheduledAt && iv.scheduledAt > now)
      if (!waitingForThisCp && daysInStage >= STALLED_AMBER_DAYS && !hasFutureInterview) {
        stalled.push({ ...ref, stage: cp.stage, daysInStage })
      }

      // (c) New applications not reviewed: partner, referral or direct candidates still in APPLIED
      const source = cp.candidate.sourcedByType
      if (cp.stage === 'APPLIED' && (source === 'VENDOR' || source === 'REFERRAL' || source === 'DIRECT')) {
        newApplications.push({ ...ref, source, daysSinceAdded: Math.max(0, Math.floor((now.getTime() - cp.createdAt.getTime()) / DAY_MS)) })
      }
    }

    snapshotRows.push({ positionId: p.id, title: p.title, client: p.client, headcount, hired, stageCounts, oldestWaitBd })
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
  newApplications.sort((a, b) => b.daysSinceAdded - a.daysSinceAdded)
  todayInterviews.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))

  const byClient = new Map<string, SnapshotRow[]>()
  for (const r of snapshotRows) byClient.set(r.client, [...(byClient.get(r.client) ?? []), r])

  const bottlenecks: BottleneckRow[] = BOTTLENECK_STAGES.map((stage) => {
    const days = bottleneckDays.get(stage) ?? []
    return {
      stage,
      active: days.length,
      avgDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      overThreshold: days.filter((d) => d >= STALLED_AMBER_DAYS).length,
    }
  })

  const needsAttention = waitingInternal.length + waitingClient.length + stalled.length + newApplications.length + startingSoon.length

  return {
    today: { label: formatInTimeZone(now, HOME_TIMEZONE, 'EEEE, MMMM d'), isoDate: todayYmd },
    counters: { openHeadcount, activeCandidates, interviewsToday: todayInterviews.length, needsAttention },
    waiting: { internal: waitingInternal, client: waitingClient },
    stalled,
    newApplications,
    startingSoon,
    todayInterviews,
    snapshot: [...byClient.entries()].map(([client, rows]) => ({ client, positions: rows })),
    bottlenecks,
  }
}
