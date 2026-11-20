import { getVisibleMatches } from '@/lib/redeployment-match-view'
import { getGlobalOpportunitySettings } from '@/lib/global-opportunity-settings'
import { getLastDigestResult } from '@/lib/redeployment-digest'
import { db } from '@/lib/db'
import { getActiveOpportunityGroups } from '@/lib/redeployment-matching'
import { GlobalMatchesView, type MatchPerson, type ProposalInfo, type ExclusionsData } from './GlobalMatchesView'

// Excluded people and targets for the "Exclusions" view (user ids resolved by the caller)
type RawExclusions = {
  people: (Omit<ExclusionsData['people'][number], 'by'> & { by: string | null })[]
  targets: ExclusionsData['targets']
  userIds: string[]
}

async function loadExclusions(): Promise<RawExclusions> {
  const [people, targets, groups] = await Promise.all([
    db.redeploymentProfile.findMany({
      where: { excludedFromMatching: true },
      select: { id: true, excludedAt: true, excludedReason: true, excludedById: true, preferredName: true, firstName: true, lastName: true, candidate: { select: { firstName: true, lastName: true } } },
      orderBy: { excludedAt: 'desc' },
    }),
    db.matchTargetExclusion.findMany({ orderBy: { excludedAt: 'desc' } }),
    getActiveOpportunityGroups(),
  ])
  const groupByKey = new Map(groups.map((g) => [g.groupKey, g]))
  const positionIds = targets.map((t) => t.positionId).filter((x): x is string => !!x)
  const positions = new Map((await db.position.findMany({ where: { id: { in: positionIds } }, select: { id: true, title: true, client: true } })).map((p) => [p.id, p]))
  return {
    people: people.map((p) => ({
      profileId: p.id,
      name: p.candidate ? `${p.candidate.firstName} ${p.candidate.lastName}`.trim() : [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' '),
      reason: p.excludedReason, at: p.excludedAt?.toISOString() ?? null, by: p.excludedById,
    })),
    targets: targets.map((t) => {
      const g = t.groupKey ? groupByKey.get(t.groupKey) : undefined
      const pos = t.positionId ? positions.get(t.positionId) : undefined
      return {
        id: t.id,
        kind: t.targetType === 'GLOBAL_GROUP' ? 'group' as const : 'position' as const,
        label: t.targetType === 'GLOBAL_GROUP'
          ? (g ? `${g.designation} · ${g.accountName ?? g.groupAccountName ?? '—'} · ${g.location}` : 'Global opportunity (no longer in the latest import)')
          : (pos ? `${pos.title} · ${pos.client}` : 'TalentOS position (deleted)'),
        reason: t.reason, at: t.excludedAt.toISOString(), by: t.excludedById,
      }
    }),
    userIds: [...people.map((p) => p.excludedById).filter((x): x is string => !!x), ...targets.map((t) => t.excludedById)],
  }
}

// Server part of the "Matches" tab: ACTIVE people with matches on assignable TalentOS positions and active global groups
export async function GlobalMatchesTab({ isAdmin, canAct }: { isAdmin: boolean; canAct: boolean }) {
  const [settings, { people: all, groupCount }] = await Promise.all([getGlobalOpportunitySettings(), getVisibleMatches()])

  // Latest proposal per global match ("Proposed to … · date · by …" + the email that was sent)
  const groupMatchIds = all.flatMap((p) => p.groupMatches.map((m) => m.id))
  const proposals = groupMatchIds.length > 0
    ? await db.opportunityProposal.findMany({ where: { matchId: { in: groupMatchIds } }, orderBy: { sentAt: 'desc' } })
    : []
  const userIds = [...new Set([...proposals.map((p) => p.sentById)])]
  const exclusionsData = await loadExclusions()
  const users = new Map((await db.user.findMany({
    where: { id: { in: [...userIds, ...exclusionsData.userIds] } }, select: { id: true, name: true, email: true },
  })).map((u) => [u.id, u.name ?? u.email]))
  // Everyone included in the same email (batchId) and every CV attached to it
  const batchIds = [...new Set(proposals.map((p) => p.batchId).filter((x): x is string => !!x))]
  const batchRows = batchIds.length > 0
    ? await db.opportunityProposal.findMany({
      where: { batchId: { in: batchIds } },
      select: { batchId: true, attachmentName: true, redeploymentProfileId: true },
    })
    : []
  const batchProfiles = new Map((batchRows.length > 0
    ? await db.redeploymentProfile.findMany({
      where: { id: { in: [...new Set(batchRows.map((r) => r.redeploymentProfileId))] } },
      select: { id: true, preferredName: true, firstName: true, lastName: true, candidate: { select: { firstName: true, lastName: true } } },
    })
    : []).map((p) => [p.id, p]))
  const batchPeople = new Map<string, { names: string[]; attachments: string[] }>()
  for (const r of batchRows) {
    const p = batchProfiles.get(r.redeploymentProfileId)
    const name = !p ? '—' : p.candidate ? `${p.candidate.firstName} ${p.candidate.lastName}`.trim() : [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ')
    const b = batchPeople.get(r.batchId!) ?? { names: [], attachments: [] }
    b.names.push(name)
    if (r.attachmentName) b.attachments.push(r.attachmentName)
    batchPeople.set(r.batchId!, b)
  }
  const latestProposal = new Map<string, ProposalInfo>()
  for (const pr of proposals) {
    if (latestProposal.has(pr.matchId)) continue
    const batch = pr.batchId ? batchPeople.get(pr.batchId) : undefined
    latestProposal.set(pr.matchId, {
      to: pr.toEmails, cc: pr.ccEmails, subject: pr.subject, body: pr.body,
      attachmentName: batch ? (batch.attachments.join(', ') || null) : pr.attachmentName,
      people: batch?.names ?? [],
      sentAt: pr.sentAt.toISOString(), by: users.get(pr.sentById) ?? '—', method: pr.method,
    })
  }
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
          id: m.id, kind: 'position' as const, targetKey: m.position.id, score: m.score, status: m.status, rationale: m.rationale, strengths: m.strengths, gaps: m.gaps, notes: m.notes,
          positionId: m.position.id, title: m.position.title, client: m.position.client, proactive: m.position.type === 'PROACTIVE',
          positionLocation: (m.position.location ?? []).join(', ') || null, positionOpenings: m.position.openings ?? null,
        })),
        ...p.groupMatches.map((m) => ({
          id: m.id, kind: 'group' as const, targetKey: m.group.groupKey, proposal: latestProposal.get(m.id) ?? null, score: m.score, status: m.status, rationale: m.rationale, strengths: m.strengths, gaps: m.gaps, notes: m.notes,
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
      <GlobalMatchesView
        people={people} defaultMinScore={settings.minScore} isAdmin={isAdmin} canAct={canAct} groupCount={groupCount}
        exclusions={{
          people: exclusionsData.people.map((p) => ({ ...p, by: p.by ? users.get(p.by) ?? '—' : '—' })),
          targets: exclusionsData.targets.map((t) => ({ ...t, by: users.get(t.by) ?? '—' })),
        }}
      />
    </div>
  )
}
