// Which interview represents a candidate-position's current state (tables, headers). Client-safe.

export type DisplayInterview = { status: string; decision: string | null; stage: string; scheduledAt: Date | null; createdAt?: Date | null }

const INTERVIEW_STAGE_ORDER: Record<string, number> = {
  OFFER: 6, CLIENT_INTERVIEW: 5, MANAGER_INTERVIEW: 4, TECHNICAL_INTERVIEW: 3, SCREENING: 2, APPLIED: 1,
}

const recency = (i: DisplayInterview) => (i.createdAt ?? i.scheduledAt)?.getTime() ?? 0

// Next upcoming non-cancelled interview → otherwise the most recent non-cancelled one → only if every interview
// is cancelled, the most recent cancelled one (shown as "Cancelled")
export function pickRelevantInterview<T extends DisplayInterview>(interviews: T[], now: Date = new Date()): T | null {
  if (interviews.length === 0) return null
  const live = interviews.filter((i) => i.status !== 'CANCELLED')
  const upcoming = live
    .filter((i) => i.scheduledAt && i.scheduledAt.getTime() >= now.getTime())
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
  if (upcoming.length > 0) return upcoming[0]
  const pool = live.length > 0 ? live : interviews
  return [...pool].sort((a, b) => recency(b) - recency(a))[0]
}

// Active stages: the relevant interview of the current stage (null → "—").
// Terminal / APPLIED: a rejecting interview if any, else the relevant one of the furthest stage reached.
export function pickCandidatePositionInterview<T extends DisplayInterview>(interviews: T[], cpStage: string, now: Date = new Date()): T | null {
  if (interviews.length === 0) return null
  if (['APPLIED', 'REJECTED', 'WITHDRAWN', 'HIRED'].includes(cpStage)) {
    const rejected = interviews.find((i) => i.decision === 'REJECT' && i.status !== 'CANCELLED') ?? interviews.find((i) => i.decision === 'REJECT')
    if (rejected) return rejected
    const live = interviews.filter((i) => i.status !== 'CANCELLED')
    const pool = live.length > 0 ? live : interviews
    const top = Math.max(...pool.map((i) => INTERVIEW_STAGE_ORDER[i.stage] ?? 0))
    return pickRelevantInterview(pool.filter((i) => (INTERVIEW_STAGE_ORDER[i.stage] ?? 0) === top), now)
  }
  return pickRelevantInterview(interviews.filter((i) => i.stage === cpStage), now)
}

// Base label per stage for auto-generated round labels (shared by interview creation and scripts/fix-interview-rounds.ts)
export const INTERVIEW_BASE_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

// Label for a new interview of a stage: cancelled interviews don't count ("Screening", "Screening - Round 2", …)
export function interviewRoundLabel(baseLabel: string, nonCancelledInStage: number): string {
  return nonCancelledInStage === 0 ? baseLabel : `${baseLabel} - Round ${nonCancelledInStage + 1}`
}
