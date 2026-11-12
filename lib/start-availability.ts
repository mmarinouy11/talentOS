// Candidate availability to start (client-safe). Always shown as entered: no date calculations.
export const START_AVAILABILITY_VALUES = [
  'IMMEDIATE', 'ONE_WEEK', 'TWO_WEEKS', 'ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS_PLUS',
] as const
export type StartAvailabilityValue = (typeof START_AVAILABILITY_VALUES)[number]

export const START_AVAILABILITY_LABELS: Record<StartAvailabilityValue, string> = {
  IMMEDIATE: 'Immediate',
  ONE_WEEK: '1 week',
  TWO_WEEKS: '2 weeks',
  ONE_MONTH: '1 month',
  TWO_MONTHS: '2 months',
  THREE_MONTHS_PLUS: '3+ months',
}

export const AVAILABILITY_STALE_DAYS = 30

export function availabilityLabel(v: string | null | undefined): string | null {
  return v && v in START_AVAILABILITY_LABELS ? START_AVAILABILITY_LABELS[v as StartAvailabilityValue] : null
}

// "updated 45d ago" when the value was last set more than 30 days ago, else null
export function availabilityStaleHint(updatedAt: Date | string | null | undefined, now: Date = new Date()): string | null {
  if (!updatedAt) return null
  const days = Math.floor((now.getTime() - new Date(updatedAt).getTime()) / 86400000)
  return days > AVAILABILITY_STALE_DAYS ? `updated ${days}d ago` : null
}

// Prisma data for a write: sets availabilityUpdatedAt only when the value changes; clearing clears both.
// `incoming` undefined = field not sent (no change).
export function availabilityWriteData(
  incoming: StartAvailabilityValue | null | undefined,
  current: string | null | undefined,
): { startAvailability?: StartAvailabilityValue | null; availabilityUpdatedAt?: Date | null } {
  if (incoming === undefined) return {}
  const next = incoming ?? null
  if (next === (current ?? null)) return {}
  return { startAvailability: next, availabilityUpdatedAt: next ? new Date() : null }
}
