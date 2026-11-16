// Display first name for candidates created from the HR roster. "Preferred name" often holds the full name
// ("Juliana Martinez"), so the Last Name is removed from it; lastName always comes from the Last Name column.
// Client-safe, no imports.

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokens(s: string | null | undefined): string[] {
  return (s ?? '').trim().split(/\s+/).filter(Boolean)
}

// Removes the Last Name (as a whole word sequence, wherever it appears) and any trailing Last Name tokens
function stripLastName(name: string[], lastName: string[]): string[] {
  const lastNorm = lastName.map(norm)
  let out = [...name]
  if (lastNorm.length > 0) {
    const nameNorm = out.map(norm)
    // Prefer the occurrence at the end, else the first one anywhere
    const at = (i: number) => lastNorm.every((t, k) => nameNorm[i + k] === t)
    const end = out.length - lastNorm.length
    const idx = end >= 0 && at(end) ? end : nameNorm.findIndex((_, i) => i + lastNorm.length <= nameNorm.length && at(i))
    if (idx >= 0) out = [...out.slice(0, idx), ...out.slice(idx + lastNorm.length)]
  }
  // Never end with any Last Name token
  const lastSet = new Set(lastNorm)
  while (out.length > 0 && lastSet.has(norm(out[out.length - 1]))) out.pop()
  return out
}

export function redeploymentFirstName(roster: { firstName: string | null; lastName: string | null; preferredName: string | null }): string {
  const last = tokens(roster.lastName)
  const fromPreferred = stripLastName(tokens(roster.preferredName), last)
  if (fromPreferred.length > 0) return fromPreferred.join(' ')
  const fromFirst = stripLastName(tokens(roster.firstName), last)
  if (fromFirst.length > 0) return fromFirst.join(' ')
  return tokens(roster.firstName).join(' ')
}
