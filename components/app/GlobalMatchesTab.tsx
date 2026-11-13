import { db } from '@/lib/db'
import { getActiveOpportunityGroups } from '@/lib/redeployment-matching'
import { getGlobalOpportunitySettings } from '@/lib/global-opportunity-settings'
import { getLastDigestResult } from '@/lib/redeployment-digest'
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

  const lastDigest = isAdmin ? await getLastDigestResult() : null
  const tone = lastDigest?.outcome === 'sent' ? 'border-gray-200 bg-white text-gray-700'
    : lastDigest?.outcome === 'error' ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-800'
  const label = { sent: 'Sent', partial: 'Partly sent', skipped: 'Not sent', error: 'Error' } as const

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm ${lastDigest ? tone : 'border-gray-200 bg-white text-gray-500'}`}>
          <span className="font-medium">Last Monday digest:</span>{' '}
          {lastDigest
            ? <>{label[lastDigest.outcome]} · {new Date(lastDigest.at).toLocaleString('en-US', { timeZone: 'America/Montevideo', dateStyle: 'medium', timeStyle: 'short' })} · {lastDigest.detail}</>
            : 'not run yet'}
        </div>
      )}
      <GlobalMatchesView people={people} defaultMinScore={settings.minScore} isAdmin={isAdmin} canAct={canAct} groupCount={groups.length} />
    </div>
  )
}
