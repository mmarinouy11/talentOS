import { db } from './db'

// Adaptive auto-scoring in Find Candidates (SystemSettings, /settings)
export const FIND_CANDIDATES_DEFAULTS = {
  FIND_CANDIDATES_STRONG_COUNT: { value: '5', description: 'Find Candidates: if a batch of 15 has at least this many strong scores, the next 15 are scored automatically.' },
  FIND_CANDIDATES_STRONG_SCORE: { value: '70', description: 'Find Candidates: fit score that counts as "strong" for automatic extra scoring.' },
  FIND_CANDIDATES_AUTO_MAX: { value: '45', description: 'Find Candidates: maximum candidates scored automatically per search (cached scores are free and not counted).' },
} as const

export async function getFindCandidatesSettings(): Promise<{ strongCount: number; strongScore: number; autoMax: number }> {
  await Promise.all(Object.entries(FIND_CANDIDATES_DEFAULTS).map(([key, d]) =>
    db.systemSettings.upsert({ where: { key }, update: {}, create: { key, value: d.value, description: d.description } }),
  ))
  const rows = await db.systemSettings.findMany({ where: { key: { in: Object.keys(FIND_CANDIDATES_DEFAULTS) } } })
  const num = (k: keyof typeof FIND_CANDIDATES_DEFAULTS) => {
    const n = Number(rows.find((r) => r.key === k)?.value)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : Number(FIND_CANDIDATES_DEFAULTS[k].value)
  }
  return { strongCount: num('FIND_CANDIDATES_STRONG_COUNT'), strongScore: num('FIND_CANDIDATES_STRONG_SCORE'), autoMax: num('FIND_CANDIDATES_AUTO_MAX') }
}
