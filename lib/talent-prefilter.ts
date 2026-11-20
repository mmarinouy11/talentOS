// Find Candidates prefilter: deterministic (no AI), decides only WHO gets real-scored first. Its numbers are never
// returned or displayed. Redeployment people go through exactly the same rules, with no bonus.

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const words = (s: string) => norm(s).split(/[\s,/()|]+/).map((w) => w.replace(/^[^a-z0-9.#+]+|[^a-z0-9#+]+$/g, '')).filter(Boolean)

// Whole-word skill match, case/accent-insensitive: equal, or one skill's word sequence inside the other
// ("Spring Boot" ~ "Spring Boot 3"; "Go" never matches "Google" or "Django")
export function skillsMatch(a: string, b: string): boolean {
  const wa = words(a), wb = words(b)
  if (wa.length === 0 || wb.length === 0) return false
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  for (let i = 0; i + short.length <= long.length; i++) {
    if (short.every((w, j) => long[i + j] === w)) return true
  }
  return false
}

const STOP = new Set(['and', 'or', 'the', 'of', 'for', 'with', 'to', 'in', 'a', 'sr', 'jr', 'senior', 'junior', 'mid', 'lead', 'principal', 'staff', 'ii', 'iii', 'i'])
const titleWords = (s: string | null | undefined) => new Set(words(s ?? '').filter((w) => w.length > 1 && !STOP.has(w)))

const SENIORITY_ORDER = ['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']
function seniorityIndex(s: string | null | undefined): number {
  const v = norm(s ?? '')
  return SENIORITY_ORDER.findIndex((x) => v.includes(x.toLowerCase()))
}

export interface PrefilterInput {
  positionTitle: string
  coreSkills: string[]
  otherSkills: string[]
  positionSeniority: string | null
  candidateSkills: string[]
  candidateLatestRole: string | null
  candidateSeniority: string | null
}

export interface PrefilterResult {
  rank: number
  // Auto-scored only with ≥1 core skill (or any skill when the position has no core skills) or a strong title match
  eligible: boolean
  matchingSkills: string[]
  // Anything in common at all (otherwise the candidate isn't listed)
  relevant: boolean
}

export function prefilterCandidate(i: PrefilterInput): PrefilterResult {
  const has = (skill: string) => i.candidateSkills.some((c) => skillsMatch(c, skill))
  const core = i.coreSkills.filter(has)
  const coreSet = new Set(i.coreSkills.map(norm))
  const other = i.otherSkills.filter((s) => !coreSet.has(norm(s))).filter(has)

  const tw = titleWords(i.positionTitle)
  const roleWords = titleWords(i.candidateLatestRole)
  const titleHits = [...tw].filter((w) => roleWords.has(w)).length
  const strongTitle = tw.size > 0 && (titleHits >= 2 || titleHits === tw.size)

  const ps = seniorityIndex(i.positionSeniority), cs = seniorityIndex(i.candidateSeniority)
  const seniority = ps < 0 || cs < 0 ? 0 : Math.abs(ps - cs) === 0 ? 2 : Math.abs(ps - cs) === 1 ? 1 : 0

  const rank = core.length * 3 + other.length + titleHits * 2 + seniority
  const eligible = (i.coreSkills.length > 0 ? core.length > 0 : other.length > 0) || strongTitle
  return { rank, eligible, matchingSkills: [...core, ...other], relevant: core.length + other.length + titleHits > 0 }
}
