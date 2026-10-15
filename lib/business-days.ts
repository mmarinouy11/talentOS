import { formatInTimeZone } from 'date-fns-tz'

// Business days = Monday–Friday (no holiday calendar)

export function businessDaysBetween(from: Date, to: Date): number {
  if (to < from) return 0
  let count = 0
  const cur = new Date(from); cur.setHours(0, 0, 0, 0)
  const end = new Date(to);   end.setHours(0, 0, 0, 0)
  while (cur <= end) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function addBusinessDays(date: Date, n: number): Date {
  const result = new Date(date); result.setHours(0, 0, 0, 0)
  let rem = n
  while (rem > 0) {
    result.setDate(result.getDate() + 1)
    const d = result.getDay()
    if (d !== 0 && d !== 6) rem--
  }
  return result
}

// Business days elapsed after kickoff up to `to` (kickoff Mon → Tue = 1)
export function elapsedBusinessDays(kickoff: Date, to: Date): number {
  const next = new Date(kickoff); next.setHours(0, 0, 0, 0); next.setDate(next.getDate() + 1)
  return businessDaysBetween(next, to)
}

// Local-midnight Date for a calendar day, so the helpers above count calendar days of that timezone
function localCalendarDay(date: Date, timeZone: string): Date {
  const [y, m, d] = formatInTimeZone(date, timeZone, 'yyyy-MM-dd').split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Business days elapsed from `from` to `to`, counting calendar days in `timeZone` (from Mon → Tue = 1)
export function elapsedBusinessDaysInTz(from: Date, to: Date, timeZone: string): number {
  return elapsedBusinessDays(localCalendarDay(from, timeZone), localCalendarDay(to, timeZone))
}
