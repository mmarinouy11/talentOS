import { getVisibleMatches } from '@/lib/redeployment-match-view'
import { getGlobalOpportunitySettings } from '@/lib/global-opportunity-settings'
import { getLastDigestResult } from '@/lib/redeployment-digest'
import { GlobalMatchesView, type MatchPerson } from './GlobalMatchesView'

// Server part of the "Matches" tab: ACTIVE people with matches on assignable TalentOS positions and active global groups
export async function GlobalMatchesTab({ isAdmin, canAct }: { isAdmin: boolean; canAct: boolean }) {
  const [settings, { people: all, groupCount }] = await Promise.all([getGlobalOpportunitySettings(), getVisibleMatches()])
  const people: MatchPerson[] = all
    .map((p) => ({
      id: p.profileId,
      candidateId: p.candidateId,
      name: p.name || '—',
      lastJobTitle: p.lastJobTitle,
      grade: p.grade,
      lwd: p.lwd?.toISOString() ?? null,
      matches: [
        ...p.positionMatches.map((m) => ({
          id: m.id, kind: 'position' as const, score: m.score, status: m.status, rationale: m.rationale, strengths: m.strengths, gaps: m.gaps, notes: m.notes,
          positionId: m.position.id, title: m.position.title, client: m.position.client, proactive: m.position.type === 'PROACTIVE',
        })),
        ...p.groupMatches.map((m) => ({
          id: m.id, kind: 'group' as const, score: m.score, status: m.status, rationale: m.rationale, strengths: m.strengths, gaps: m.gaps, notes: m.notes,
          designation: m.group.designation, account: m.group.accountName ?? m.group.groupAccountName, location: m.group.location, workMode: m.group.workMode,
          openings: m.group.openings, requisitionIds: m.group.requisitionIds, plannedOnboarding: m.group.plannedOnboardingDate?.toISOString() ?? null,
        })),
      ],
    }))
    .filter((p) => p.matches.length > 0)
    .sort((a, b) => Math.max(...b.matches.map((m) => m.score)) - Math.max(...a.matches.map((m) => m.score)))

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
      <GlobalMatchesView people={people} defaultMinScore={settings.minScore} isAdmin={isAdmin} canAct={canAct} groupCount={groupCount} />
    </div>
  )
}
