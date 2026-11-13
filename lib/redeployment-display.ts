// Client-safe helpers for the Redeployment badge and LWD chip
const DAY_MS = 86_400_000

export type LwdChip = { label: string; tone: 'soon' | 'past' }

// LWD is stored as a UTC date; compared by calendar day
export function lwdChip(lwd: Date | string | null | undefined, now: Date = new Date()): LwdChip | null {
  if (!lwd) return null
  const d = new Date(lwd)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const diff = Math.round((day - today) / DAY_MS)
  if (diff > 0) return { label: `Releases in ${diff}d`, tone: 'soon' }
  if (diff === 0) return { label: 'Releases today', tone: 'soon' }
  return { label: `Released ${-diff}d ago`, tone: 'past' }
}
