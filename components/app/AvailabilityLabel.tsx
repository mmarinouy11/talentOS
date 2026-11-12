import { availabilityLabel, availabilityStaleHint } from '@/lib/start-availability'

// Availability to start as entered, plus a muted "updated Nd ago" when older than 30 days
export function AvailabilityLabel({ value, updatedAt, empty = null }: {
  value: string | null | undefined
  updatedAt: Date | string | null | undefined
  empty?: React.ReactNode
}) {
  const label = availabilityLabel(value)
  if (!label) return <>{empty}</>
  const hint = availabilityStaleHint(updatedAt)
  return (
    <span className="whitespace-nowrap">
      {label}
      {hint && <span className="ml-1.5 text-xs text-gray-400">{hint}</span>}
    </span>
  )
}
