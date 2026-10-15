import { db } from './db'
import { callClaudeJSON } from './anthropic'
import { locationAllowed } from './location'

const SYSTEM_PROMPT = `You are a recruiting intelligence system. Score how well a candidate matches a job position.
Return ONLY valid JSON with no markdown:
{
  "technicalFitScore": 0-100,
  "seniorityFitScore": 0-100,
  "domainFitScore": 0-100,
  "communicationFitScore": 0-100,
  "fitScore": 0-100,
  "fitSummary": "",
  "fitStrengths": [],
  "fitGaps": []
}
Scoring rules:
- technicalFitScore: % of required JD skills that candidate has
- seniorityFitScore: how well candidate seniority matches expected seniority
- domainFitScore: relevance of candidate experience to the role domain
- communicationFitScore: language match + communication profile
- fitScore: weighted average (technical 40%, seniority 25%, domain 20%, communication 15%)
- Be honest — a 60 is a decent match, 80+ is strong, 90+ is exceptional
- fitSummary: 2-3 sentences explaining the overall match
- fitStrengths: 3-5 specific matching points
- fitGaps: 2-4 missing skills or mismatches`

const MAX_OTHER_POSITIONS = 10
// A suggested position must beat the current one by at least this many points
const SUGGESTION_MIN_DELTA = 10

type OtherPosition = { id: string; title: string; seniority: string | null; coreSkills: string[]; topSkills: string[] }

// Other OPEN positions (requisition or proactive, not fulfilled) the candidate could fit: location allows
// their country and at least one JD/core skill overlaps their skills. Most overlap first, max 10.
async function findOtherPositions(
  currentPositionId: string,
  candidate: { country: string | null; skills: string[] },
): Promise<OtherPosition[]> {
  const candidateSkills = new Set(candidate.skills.map((s) => s.trim().toLowerCase()).filter(Boolean))
  if (candidateSkills.size === 0) return []
  // Unknown country: only positions open to anyone qualify (an empty string would match every location)
  const country = candidate.country?.trim() || '__unknown_country__'

  const positions = await db.position.findMany({
    where: { deletedAt: null, status: 'OPEN', type: { in: ['REQUISITION', 'PROACTIVE'] }, id: { not: currentPositionId } },
    select: {
      id: true, title: true, headcount: true, location: true, jdSeniority: true, coreSkills: true, jdSkills: true,
      _count: { select: { candidatePositions: { where: { status: 'HIRED' } } } },
    },
  })

  return positions
    .filter((p) => p._count.candidatePositions < (p.headcount ?? 1))
    .filter((p) => locationAllowed(p.location, country))
    .map((p) => {
      const skills = [...new Set([...p.coreSkills, ...p.jdSkills].map((s) => s.trim().toLowerCase()))]
      return { p, overlap: skills.filter((s) => candidateSkills.has(s)).length }
    })
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, MAX_OTHER_POSITIONS)
    .map(({ p }) => ({
      id: p.id,
      title: p.title,
      seniority: p.jdSeniority,
      coreSkills: p.coreSkills,
      topSkills: p.jdSkills.filter((s) => !p.coreSkills.includes(s)).slice(0, 8),
    }))
}

function otherPositionsSection(others: OtherPosition[]): string {
  if (others.length === 0) return ''
  const list = others
    .map((o) => `- id: ${o.id} | ${o.title} | seniority: ${o.seniority ?? 'n/a'} | core: ${o.coreSkills.join(', ') || 'n/a'} | skills: ${o.topSkills.join(', ') || 'n/a'}`)
    .join('\n')
  return `

OTHER OPEN POSITIONS (for "suggestedPosition"):
${list}`
}

const EXTRA_OUTPUT_RULES = (hasOthers: boolean) => `

Also include in the JSON:
- "strongestRoles": 2-3 generic role types where this candidate is strongest overall, independent of this position (e.g. "Backend Engineer (Node.js)", "Data Engineer")
${hasOthers
    ? `- "suggestedPosition": { "positionId": "<id from OTHER OPEN POSITIONS>", "estimatedScore": 0-100, "reason": "<one sentence>" } for the best match among OTHER OPEN POSITIONS, or null. Return it ONLY if estimatedScore is at least ${SUGGESTION_MIN_DELTA} points higher than fitScore for the current position; otherwise null.`
    : `- "suggestedPosition": null`}`

export async function scoreCandidateForPosition(candidatePositionId: string): Promise<void> {
  const cp = await db.candidatePosition.findFirst({
    where: { id: candidatePositionId },
    include: { candidate: true, position: true },
  })
  if (!cp) return

  const { candidate, position } = cp

  const coreSkills = position.coreSkills ?? []
  const nonCoreSkills = (position.jdSkills ?? []).filter((s) => !coreSkills.includes(s))

  const skillsSection = coreSkills.length > 0
    ? `CRITICAL REQUIREMENTS (must-have skills): ${coreSkills.join(', ')}
If the candidate is missing most of these critical skills, their overall fit score must be significantly penalized — ideally below 40% regardless of other strengths.

Additional skills: ${nonCoreSkills.join(', ') || 'Not specified'}`
    : `Required Skills: ${position.jdSkills.join(', ') || 'Not specified'}`

  const others = await findOtherPositions(position.id, candidate)

  const prompt = `POSITION:
Title: ${position.title}
Client: ${position.client}
${skillsSection}
Expected Seniority: ${position.jdSeniority ?? 'Not specified'}
Required Languages: ${position.jdLanguages.join(', ') || 'Not specified'}
Job Summary: ${position.jdSummary ?? 'Not specified'}
Full JD: ${position.description}

CANDIDATE:
Name: ${candidate.firstName} ${candidate.lastName}
Seniority: ${candidate.seniority ?? 'Not specified'}
Years of Experience: ${candidate.yearsOfExperience ?? 'Not specified'}
Skills: ${candidate.skills.join(', ') || 'Not specified'}
Languages: ${candidate.languages.join(', ') || 'Not specified'}
Summary: ${candidate.summary ?? 'Not specified'}${otherPositionsSection(others)}`

  const scored = await callClaudeJSON<{
    technicalFitScore: number
    seniorityFitScore: number
    domainFitScore: number
    communicationFitScore: number
    fitScore: number
    fitSummary: string
    fitStrengths: string[]
    fitGaps: string[]
    strongestRoles?: string[]
    suggestedPosition?: { positionId?: string; estimatedScore?: number; reason?: string } | null
  }>(prompt, 'SMART', SYSTEM_PROMPT + EXTRA_OUTPUT_RULES(others.length > 0))

  // Only accept a suggestion for a position we offered, and only if it clearly beats this one
  const sp = scored.suggestedPosition
  const validSuggestion = sp && typeof sp.positionId === 'string' && others.some((o) => o.id === sp.positionId)
    && typeof sp.estimatedScore === 'number' && sp.estimatedScore >= scored.fitScore + SUGGESTION_MIN_DELTA
    ? sp : null
  const strongestRoles = Array.isArray(scored.strongestRoles)
    ? scored.strongestRoles.filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim()).slice(0, 3)
    : []

  await db.candidatePosition.update({
    where: { id: candidatePositionId },
    data: {
      fitScore: scored.fitScore,
      technicalFitScore: scored.technicalFitScore,
      seniorityFitScore: scored.seniorityFitScore,
      domainFitScore: scored.domainFitScore,
      communicationFitScore: scored.communicationFitScore,
      fitSummary: scored.fitSummary,
      fitStrengths: scored.fitStrengths ?? [],
      fitGaps: scored.fitGaps ?? [],
      fitScoredAt: new Date(),
      strongestRoles,
      suggestedPositionId: validSuggestion?.positionId ?? null,
      suggestedPositionScore: validSuggestion ? Math.round(validSuggestion.estimatedScore!) : null,
      suggestedPositionReason: validSuggestion?.reason?.trim() || null,
    },
  })
}
