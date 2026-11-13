import { createHash } from 'crypto'
import type { Prisma, SourceType } from '@prisma/client'
import { db } from './db'
import { callClaudeJSON, MODELS } from './anthropic'
import { locationAllowed } from './location'
import { HIRED_CANDIDATE_POSITION_WHERE, isPositionFulfilled } from './position-fulfillment'

// Bump whenever the fit prompt, rubric or output shape changes: invalidates every cached score
export const FIT_PROMPT_VERSION = 'fit-v2'

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
  "fitGaps": [],
  "strongestRoles": []
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
- fitGaps: 2-4 missing skills or mismatches
- strongestRoles: 2-3 generic role types where this candidate is strongest overall, independent of this position (e.g. "Backend Engineer (Node.js)", "Data Engineer")`

export interface FitScoreResult {
  fitScore: number
  technicalFitScore: number
  seniorityFitScore: number
  domainFitScore: number
  communicationFitScore: number
  fitSummary: string
  fitStrengths: string[]
  fitGaps: string[]
  strongestRoles: string[]
}

// Default minimum points a suggested position's real score must beat the current one by (SystemSettings BETTER_MATCH_MIN_DELTA)
export const BETTER_MATCH_MIN_DELTA_DEFAULT = 8
// Default absolute floor for a suggested position's real score (SystemSettings BETTER_MATCH_MIN_SCORE)
export const BETTER_MATCH_MIN_SCORE_DEFAULT = 70
// Positions the cheap shortlist step may pass on to real scoring
const SHORTLIST_SIZE = 2

type ScoringCandidate = {
  id: string; firstName: string; lastName: string; seniority: string | null; yearsOfExperience: number | null
  skills: string[]; languages: string[]; summary: string | null; country: string | null; cvDriveId: string | null
  sourcedByType?: SourceType | null
}
type ScoringPosition = {
  id: string; title: string; client: string; coreSkills: string[]; jdSkills: string[]; jdSeniority: string | null
  jdLanguages: string[]; jdSummary: string | null; description: string
}

function buildFitPrompt(candidate: ScoringCandidate, position: ScoringPosition): string {
  const coreSkills = position.coreSkills ?? []
  const nonCoreSkills = (position.jdSkills ?? []).filter((s) => !coreSkills.includes(s))

  const skillsSection = coreSkills.length > 0
    ? `CRITICAL REQUIREMENTS (must-have skills): ${coreSkills.join(', ')}
If the candidate is missing most of these critical skills, their overall fit score must be significantly penalized — ideally below 40% regardless of other strengths.

Additional skills: ${nonCoreSkills.join(', ') || 'Not specified'}`
    : `Required Skills: ${position.jdSkills.join(', ') || 'Not specified'}`

  return `POSITION:
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
Summary: ${candidate.summary ?? 'Not specified'}`
}

// Hash of everything that determines a score: the full prompt (candidate profile + position JD/requirements),
// the CV file, the prompt version and the model
function fitInputsHash(prompt: string, candidate: ScoringCandidate): string {
  return createHash('sha256')
    .update([FIT_PROMPT_VERSION, MODELS.SMART, SYSTEM_PROMPT, candidate.cvDriveId ?? '', prompt].join('\u0000'))
    .digest('hex')
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function strs(v: unknown, max = 10): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()).slice(0, max) : []
}

function normalizeResult(raw: Record<string, unknown>): FitScoreResult {
  return {
    fitScore: num(raw.fitScore),
    technicalFitScore: num(raw.technicalFitScore),
    seniorityFitScore: num(raw.seniorityFitScore),
    domainFitScore: num(raw.domainFitScore),
    communicationFitScore: num(raw.communicationFitScore),
    fitSummary: typeof raw.fitSummary === 'string' ? raw.fitSummary : '',
    fitStrengths: strs(raw.fitStrengths),
    fitGaps: strs(raw.fitGaps),
    strongestRoles: strs(raw.strongestRoles, 3),
  }
}

/**
 * The single source of truth for a candidate's fit against a position. Every scoring path
 * (adding to a position, re-score, better-match suggestions, future Redeployment matching) must go through here.
 * Same inputs → the cached result, so the numbers are identical everywhere and no new AI call is made.
 */
export async function getOrComputeFitScore(
  candidateId: string,
  positionId: string,
  opts: { cacheOnly?: boolean } = {},
): Promise<FitScoreResult | null> {
  const [candidate, position] = await Promise.all([
    db.candidate.findUnique({ where: { id: candidateId } }),
    db.position.findUnique({ where: { id: positionId } }),
  ])
  if (!candidate || !position) return null

  const prompt = buildFitPrompt(candidate, position)
  const inputsHash = fitInputsHash(prompt, candidate)

  const cached = await db.fitScoreCache.findUnique({
    where: { candidateId_positionId_inputsHash: { candidateId, positionId, inputsHash } },
  })
  if (cached) return normalizeResult(cached.result as Record<string, unknown>)
  // cacheOnly: report whether a current score exists without spending an AI call
  if (opts.cacheOnly) return null

  const raw = await callClaudeJSON<Record<string, unknown>>(prompt, 'SMART', SYSTEM_PROMPT, { temperature: 0 })
  const result = normalizeResult(raw)

  try {
    await db.fitScoreCache.create({
      data: { candidateId, positionId, inputsHash, result: result as unknown as Prisma.InputJsonValue, model: MODELS.SMART },
    })
  } catch {
    // A concurrent scoring stored the same inputs first: use that row so both callers agree
    const winner = await db.fitScoreCache.findUnique({
      where: { candidateId_positionId_inputsHash: { candidateId, positionId, inputsHash } },
    })
    if (winner) return normalizeResult(winner.result as Record<string, unknown>)
  }
  return result
}

// Same prompt, rubric, model and temperature for a non-TalentOS target (e.g. a global opportunity group mapped to
// the position shape). Returns the prompt and its inputs hash so callers can skip unchanged pairs.
export type PositionLike = Omit<ScoringPosition, 'id'>

export async function fitPromptAndHash(candidateId: string, target: PositionLike): Promise<{ prompt: string; inputsHash: string } | null> {
  const candidate = await db.candidate.findUnique({ where: { id: candidateId } })
  if (!candidate) return null
  const prompt = buildFitPrompt(candidate, { ...target, id: '' })
  return { prompt, inputsHash: fitInputsHash(prompt, candidate) }
}

export async function runFitPrompt(prompt: string): Promise<FitScoreResult> {
  const raw = await callClaudeJSON<Record<string, unknown>>(prompt, 'SMART', SYSTEM_PROMPT, { temperature: 0 })
  return normalizeResult(raw)
}

async function numberSetting(key: string, fallback: number): Promise<number> {
  const row = await db.systemSettings.findUnique({ where: { key } })
  const n = row ? Number(row.value) : NaN
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function getBetterMatchMinDelta(): Promise<number> {
  return numberSetting('BETTER_MATCH_MIN_DELTA', BETTER_MATCH_MIN_DELTA_DEFAULT)
}

export function getBetterMatchMinScore(): Promise<number> {
  return numberSetting('BETTER_MATCH_MIN_SCORE', BETTER_MATCH_MIN_SCORE_DEFAULT)
}

// Absolute floor for suggesting a position: its own minimum for the candidate's source
// (vendor/referral → vendorMinFitScore, direct → directMinFitScore), else BETTER_MATCH_MIN_SCORE
export function betterMatchFloor(
  position: { vendorMinFitScore: number | null; directMinFitScore: number | null },
  sourcedByType: SourceType | null | undefined,
  fallback: number,
): number {
  if (sourcedByType === 'VENDOR' || sourcedByType === 'REFERRAL') return position.vendorMinFitScore ?? fallback
  if (sourcedByType === 'DIRECT') return position.directMinFitScore ?? fallback
  return fallback
}

// The better-match rule, shared by scoring and scripts/recompute-better-match.ts
export function passesBetterMatch(realSuggested: number, currentScore: number, minDelta: number, floor: number): boolean {
  return realSuggested >= Math.round(currentScore) + minDelta && realSuggested >= floor
}

const MAX_OTHER_POSITIONS = 10
// A suggested position must beat the current one by at least this many points
const SUGGESTION_MIN_DELTA = 10

type OtherPosition = {
  id: string; title: string; seniority: string | null; coreSkills: string[]; topSkills: string[]
  vendorMinFitScore: number | null; directMinFitScore: number | null
}

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
      vendorMinFitScore: true, directMinFitScore: true,
      _count: { select: { candidatePositions: { where: HIRED_CANDIDATE_POSITION_WHERE } } },
    },
  })

  return positions
    .filter((p) => !isPositionFulfilled(p.headcount, p._count.candidatePositions))
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
      vendorMinFitScore: p.vendorMinFitScore,
      directMinFitScore: p.directMinFitScore,
      title: p.title,
      seniority: p.jdSeniority,
      coreSkills: p.coreSkills,
      topSkills: p.jdSkills.filter((s) => !p.coreSkills.includes(s)).slice(0, 8),
    }))
}

const SHORTLIST_PROMPT = `You shortlist open positions for a candidate. Return ONLY JSON: { "positionIds": [] } with at most ${SHORTLIST_SIZE} ids from the list, best fit first. Do not score.`

// Cheap step: narrows the other positions to at most 2 for real scoring. Its output is never shown.
async function shortlistOtherPositions(candidate: ScoringCandidate, others: OtherPosition[]): Promise<OtherPosition[]> {
  if (others.length <= SHORTLIST_SIZE) return others
  try {
    const list = others
      .map((o) => `- id: ${o.id} | ${o.title} | seniority: ${o.seniority ?? 'n/a'} | core: ${o.coreSkills.join(', ') || 'n/a'} | skills: ${o.topSkills.join(', ') || 'n/a'}`)
      .join('\n')
    const res = await callClaudeJSON<{ positionIds?: unknown }>(
      `CANDIDATE:\nSeniority: ${candidate.seniority ?? 'n/a'}\nYears: ${candidate.yearsOfExperience ?? 'n/a'}\nSkills: ${candidate.skills.join(', ') || 'n/a'}\nSummary: ${candidate.summary ?? 'n/a'}\n\nPOSITIONS:\n${list}`,
      'FAST', SHORTLIST_PROMPT, { temperature: 0 },
    )
    const ids = strs(res.positionIds, SHORTLIST_SIZE)
    const picked = ids.map((id) => others.find((o) => o.id === id)).filter((o): o is OtherPosition => !!o)
    if (picked.length > 0) return picked
  } catch (err) {
    console.error('[fit-scorer] Shortlist failed, falling back to skill overlap:', err)
  }
  return others.slice(0, SHORTLIST_SIZE)
}

export type BetterMatch = { positionId: string; score: number; reason: string | null }

// Real scores only: the best shortlisted position whose real fit beats currentScore by the configured delta
export async function findBetterMatch(
  candidate: ScoringCandidate,
  currentPositionId: string,
  currentScore: number,
): Promise<BetterMatch | null> {
  const others = await findOtherPositions(currentPositionId, candidate)
  if (others.length === 0) return null
  const [shortlist, minDelta, minScore] = await Promise.all([
    shortlistOtherPositions(candidate, others), getBetterMatchMinDelta(), getBetterMatchMinScore(),
  ])

  let best: BetterMatch | null = null
  for (const o of shortlist) {
    const r = await getOrComputeFitScore(candidate.id, o.id)
    if (!r) continue
    const score = Math.round(r.fitScore)
    const floor = betterMatchFloor(o, candidate.sourcedByType, minScore)
    if (passesBetterMatch(score, currentScore, minDelta, floor) && (!best || score > best.score)) {
      best = { positionId: o.id, score, reason: r.fitSummary.trim() || null }
    }
  }
  return best
}

// Writes a (cached) fit result onto a CandidatePosition; no AI call
export async function applyFitResult(candidatePositionId: string, result: FitScoreResult): Promise<void> {
  await db.candidatePosition.update({
    where: { id: candidatePositionId },
    data: {
      fitScore: result.fitScore,
      technicalFitScore: result.technicalFitScore,
      seniorityFitScore: result.seniorityFitScore,
      domainFitScore: result.domainFitScore,
      communicationFitScore: result.communicationFitScore,
      fitSummary: result.fitSummary,
      fitStrengths: result.fitStrengths,
      fitGaps: result.fitGaps,
      fitScoredAt: new Date(),
      strongestRoles: result.strongestRoles,
    },
  })
}

export async function scoreCandidateForPosition(candidatePositionId: string): Promise<void> {
  const cp = await db.candidatePosition.findFirst({
    where: { id: candidatePositionId },
    include: { candidate: true },
  })
  if (!cp) return

  const result = await getOrComputeFitScore(cp.candidateId, cp.positionId)
  if (!result) return

  await applyFitResult(candidatePositionId, result)

  // The suggestion is best-effort: a failure here never loses the score saved above
  let match: BetterMatch | null = null
  try {
    match = await findBetterMatch(cp.candidate, cp.positionId, result.fitScore)
  } catch (err) {
    console.error(`[fit-scorer] Better-match lookup failed for candidatePosition ${candidatePositionId}:`, err)
  }
  await db.candidatePosition.update({
    where: { id: candidatePositionId },
    data: {
      suggestedPositionId: match?.positionId ?? null,
      suggestedPositionScore: match?.score ?? null,
      suggestedPositionReason: match?.reason ?? null,
    },
  })
}
