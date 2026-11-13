import { db } from '@/lib/db'
import { getActiveOpportunityGroups } from '@/lib/redeployment-matching'
import { getGlobalOpportunitySettings } from '@/lib/global-opportunity-settings'
import { GlobalMatchesView, type MatchPerson } from './GlobalMatchesView'

// Server part of the "Global matches" tab: ACTIVE people with their matches on still-active opportunity groups
export async function GlobalMatchesTab({ isAdmin, canAct }: { isAdmin: boolean; canAct: boolean }) {
  const [settings, groups, profiles] = await Promise.all([
    getGlobalOpportunitySettings(),
    getActiveOpportunityGroups(),
    db.redeploymentProfile.findMany({
      where: { status: 'ACTIVE', candidateId: { not: null } },
      select: {
        id: true, lwd: true, lastJobTitle: true, grade: true,
        candidate: { select: { id: true, firstName: true, lastName: true } },
        opportunityMatches: { orderBy: { score: 'desc' } },
      },
    }),
  ])
  const byKey = new Map(groups.map((g) => [g.groupKey, g]))
  const people: MatchPerson[] = profiles
    .map((p) => ({
      id: p.id,
      candidateId: p.candidate?.id ?? null,
      name: p.candidate ? `${p.candidate.firstName} ${p.candidate.lastName}`.trim() : '—',
      lastJobTitle: p.lastJobTitle,
      grade: p.grade,
      lwd: p.lwd?.toISOString() ?? null,
      matches: p.opportunityMatches.filter((m) => byKey.has(m.groupKey)).map((m) => {
        const g = byKey.get(m.groupKey)!
        return {
          id: m.id, score: m.score, status: m.status, rationale: m.rationale, strengths: m.strengths, gaps: m.gaps, notes: m.notes,
          designation: g.designation, account: g.accountName ?? g.groupAccountName, location: g.location, workMode: g.workMode,
          openings: g.openings, requisitionIds: g.requisitionIds, plannedOnboarding: g.plannedOnboardingDate?.toISOString() ?? null,
        }
      }),
    }))
    .filter((p) => p.matches.length > 0)
    .sort((a, b) => b.matches[0].score - a.matches[0].score)

  return <GlobalMatchesView people={people} defaultMinScore={settings.minScore} isAdmin={isAdmin} canAct={canAct} groupCount={groups.length} />
}
