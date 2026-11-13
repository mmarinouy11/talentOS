import type { GlobalOpportunity } from '@prisma/client'
import { db } from './db'
import { fitPromptAndHash, runFitPrompt, type PositionLike } from './fit-scorer'
import { getGlobalOpportunitySettings } from './global-opportunity-settings'

const CONCURRENCY = 3

export interface OpportunityGroup {
  groupKey: string
  designation: string
  accountName: string | null
  groupAccountName: string | null
  location: string
  workMode: string | null
  grade: string | null
  experience: string | null
  primarySkill: string | null
  subSkills: string[]
  mandatorySkills: string[]
  jobSummary: string | null
  jobDescription: string | null
  openings: number
  requisitionIds: string[]
  plannedOnboardingDate: Date | null
  stageName: string | null
  confidenceLevel: string | null
}

// Active opportunities folded by groupKey (first requisition by id is the representative)
export function groupOpportunities(rows: GlobalOpportunity[]): OpportunityGroup[] {
  const groups = new Map<string, OpportunityGroup>()
  for (const o of [...rows].sort((a, b) => a.requisitionId.localeCompare(b.requisitionId))) {
    const g = groups.get(o.groupKey)
    if (!g) {
      groups.set(o.groupKey, {
        groupKey: o.groupKey, designation: o.designation, accountName: o.accountName, groupAccountName: o.groupAccountName,
        location: o.location, workMode: o.workMode, grade: o.grade, experience: o.experience, primarySkill: o.primarySkill,
        subSkills: [...o.subSkills], mandatorySkills: [...o.mandatorySkills], jobSummary: o.jobSummary, jobDescription: o.jobDescription,
        openings: o.openings, requisitionIds: [o.requisitionId], plannedOnboardingDate: o.plannedOnboardingDate,
        stageName: o.stageName, confidenceLevel: o.confidenceLevel,
      })
      continue
    }
    g.openings += o.openings
    g.requisitionIds.push(o.requisitionId)
    if (o.plannedOnboardingDate && (!g.plannedOnboardingDate || o.plannedOnboardingDate < g.plannedOnboardingDate)) g.plannedOnboardingDate = o.plannedOnboardingDate
    for (const s of o.subSkills) if (!g.subSkills.includes(s)) g.subSkills.push(s)
  }
  return [...groups.values()]
}

export async function getActiveOpportunityGroups(): Promise<OpportunityGroup[]> {
  return groupOpportunities(await db.globalOpportunity.findMany({ where: { active: true } }))
}

const normSkill = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '')
const STOP = new Set(['and', 'or', 'the', 'of', 'for', 'with', 'sr', 'jr', 'senior', 'junior', 'lead', 'ii', 'iii', 'i'])
const words = (s: string | null) => new Set((s ?? '').toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1 && !STOP.has(w)))

// Deterministic, no AI, never displayed: skill overlap (×2) + title word overlap
function prefilterScore(personSkills: string[], lastJobTitle: string | null, g: OpportunityGroup): number {
  const mine = personSkills.map(normSkill).filter((s) => s.length >= 2)
  const theirs = [...g.mandatorySkills, ...(g.primarySkill ? [g.primarySkill] : []), ...g.subSkills].map(normSkill).filter((s) => s.length >= 2)
  const overlap = new Set(theirs.filter((t) => mine.some((m) => m === t || m.includes(t) || t.includes(m)))).size
  const titleA = words(lastJobTitle)
  const titleHits = [...words(g.designation)].filter((w) => titleA.has(w)).length
  return overlap * 2 + titleHits
}

// The opportunity group in the shape the fit-score prompt expects for a position
export function groupAsPosition(g: OpportunityGroup): PositionLike {
  const other = [...(g.primarySkill ? [g.primarySkill] : []), ...g.subSkills]
  return {
    title: g.designation,
    client: g.accountName ?? g.groupAccountName ?? 'Not specified',
    coreSkills: g.mandatorySkills,
    jdSkills: [...new Set([...g.mandatorySkills, ...other])],
    jdSeniority: [g.grade && `Grade ${g.grade}`, g.experience && `${g.experience} experience`].filter(Boolean).join(', ') || null,
    jdLanguages: [],
    jdSummary: g.jobSummary,
    description: g.jobDescription ?? g.jobSummary ?? '',
  }
}

export interface MatchingSummary { people: number; groups: number; pairs: number; scored: number; unchanged: number; failed: number }

const g = globalThis as unknown as { __redeploymentMatching?: { running: boolean; again: boolean } }
const state = (g.__redeploymentMatching ??= { running: false, again: false })

// Safe to call any time: a call during a run schedules one more run afterwards
export async function runRedeploymentMatching(): Promise<MatchingSummary | null> {
  if (state.running) { state.again = true; return null }
  state.running = true
  try {
    let summary: MatchingSummary
    do {
      state.again = false
      summary = await match()
    } while (state.again)
    return summary
  } finally {
    state.running = false
  }
}

async function match(): Promise<MatchingSummary> {
  const settings = await getGlobalOpportunitySettings()
  const [profiles, groups] = await Promise.all([
    db.redeploymentProfile.findMany({
      where: { status: 'ACTIVE', candidateId: { not: null }, candidate: { deletedAt: null } },
      select: { id: true, candidateId: true, primarySkill: true, subSkill: true, lastJobTitle: true, candidate: { select: { skills: true } } },
    }),
    getActiveOpportunityGroups(),
  ])
  const summary: MatchingSummary = { people: profiles.length, groups: groups.length, pairs: 0, scored: 0, unchanged: 0, failed: 0 }
  if (groups.length === 0) return summary

  const pairs: { profileId: string; candidateId: string; group: OpportunityGroup }[] = []
  for (const p of profiles) {
    const skills = [...(p.candidate?.skills ?? []), ...[p.primarySkill, p.subSkill].filter((s): s is string => !!s)]
    groups
      .map((gr) => ({ gr, s: prefilterScore(skills, p.lastJobTitle, gr) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, settings.topN)
      .forEach(({ gr }) => pairs.push({ profileId: p.id, candidateId: p.candidateId!, group: gr }))
  }
  summary.pairs = pairs.length

  const queue = [...pairs]
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let pair = queue.shift(); pair; pair = queue.shift()) {
      try {
        const built = await fitPromptAndHash(pair.candidateId, groupAsPosition(pair.group))
        if (!built) continue
        const existing = await db.opportunityMatch.findUnique({
          where: { redeploymentProfileId_groupKey: { redeploymentProfileId: pair.profileId, groupKey: pair.group.groupKey } },
          select: { inputsHash: true },
        })
        if (existing?.inputsHash === built.inputsHash) { summary.unchanged++; continue }
        const r = await runFitPrompt(built.prompt)
        const scoreData = {
          score: Math.max(0, Math.min(100, Math.round(r.fitScore))),
          rationale: r.fitSummary,
          strengths: r.fitStrengths,
          gaps: r.fitGaps,
          inputsHash: built.inputsHash,
          scoredAt: new Date(),
        }
        // Re-scoring only updates the score fields: PROPOSED / DISMISSED and notes are kept
        await db.opportunityMatch.upsert({
          where: { redeploymentProfileId_groupKey: { redeploymentProfileId: pair.profileId, groupKey: pair.group.groupKey } },
          create: { redeploymentProfileId: pair.profileId, groupKey: pair.group.groupKey, ...scoreData },
          update: scoreData,
        })
        summary.scored++
      } catch (err) {
        // Left unscored; retried on the next run
        summary.failed++
        console.error(`[redeployment-matching] Pair ${pair.profileId}/${pair.group.groupKey} failed:`, err instanceof Error ? err.message : err)
      }
    }
  }))
  console.log('[redeployment-matching] Done', JSON.stringify(summary))
  return summary
}
