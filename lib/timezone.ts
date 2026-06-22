import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  'Argentina': 'America/Argentina/Buenos_Aires',
  'Uruguay': 'America/Montevideo',
  'Chile': 'America/Santiago',
  'Colombia': 'America/Bogota',
  'Mexico': 'America/Mexico_City',
  'Peru': 'America/Lima',
  'Brazil': 'America/Sao_Paulo',
  'Bolivia': 'America/La_Paz',
  'Paraguay': 'America/Asuncion',
  'Ecuador': 'America/Guayaquil',
  'Venezuela': 'America/Caracas',
  'India': 'Asia/Kolkata',
}

// Curated timezone list for recruiter selection
export const RECRUITER_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Montevideo', label: 'Montevideo (UYT)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (ART)' },
  { value: 'America/Santiago', label: 'Santiago (CLT)' },
  { value: 'America/Bogota', label: 'Bogotá (COT)' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST)' },
  { value: 'America/Lima', label: 'Lima (PET)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'America/La_Paz', label: 'La Paz (BOT)' },
  { value: 'America/Asuncion', label: 'Asunción (PYT)' },
  { value: 'America/Guayaquil', label: 'Guayaquil (ECT)' },
  { value: 'America/Caracas', label: 'Caracas (VET)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET)' },
  { value: 'Asia/Kolkata', label: 'Mumbai / India (IST)' },
  { value: 'UTC', label: 'UTC' },
]

export function getTimezoneForCountry(country: string | null | undefined): string {
  if (!country) return 'America/Montevideo'
  return COUNTRY_TIMEZONE_MAP[country] ?? 'America/Montevideo'
}

function getGmtOffset(utcDate: Date, tz: string): string {
  // e.g. "GMT-3" or "GMT+5:30"
  const offsetStr = formatInTimeZone(utcDate, tz, 'xxx') // "+05:30" or "-03:00"
  const [h, m] = offsetStr.split(':')
  const sign = h.startsWith('-') ? '-' : '+'
  const hNum = parseInt(h.replace(/[+-]/, ''), 10)
  const mNum = parseInt(m, 10)
  if (mNum === 0) return `GMT${sign}${hNum}`
  return `GMT${sign}${hNum}:${m}`
}

function getCityLabel(tz: string): string {
  // Convert "America/Sao_Paulo" → "São Paulo", use last segment, replace underscores
  const found = RECRUITER_TIMEZONES.find((t) => t.value === tz)
  if (found) {
    // Strip abbreviation from label: "Montevideo (UYT)" → "Montevideo"
    return found.label.replace(/\s*\([^)]+\)$/, '')
  }
  const parts = tz.split('/')
  return parts[parts.length - 1].replace(/_/g, ' ')
}

export function formatSlotForCandidate(utcDate: Date, candidateCountry: string | null): string {
  const tz = getTimezoneForCountry(candidateCountry)
  const datePart = formatInTimeZone(utcDate, tz, "EEEE, MMMM d 'at' h:mm a")
  const city = getCityLabel(tz)
  const offset = getGmtOffset(utcDate, tz)
  return `${datePart} - ${city} (${offset})`
}

// Convert a "wall-clock" datetime string (as from datetime-local input) + a timezone into a UTC ISO string
export function zonedToUtcIso(localDatetimeStr: string, timezone: string): string {
  const utc = fromZonedTime(localDatetimeStr, timezone)
  return utc.toISOString()
}
