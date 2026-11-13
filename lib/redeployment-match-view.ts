import type { OpportunityMatch } from '@prisma/client'
import { db } from './db'
import { getActiveOpportunityGroups, type OpportunityGroup } from './redeployment-matching'
import { getAssignablePositionsForCandidates, type AssignablePosition } from './assignable-positions'

export type PositionMatchView = OpportunityMatch & { position: AssignablePosition }
export type GroupMatchView = OpportunityMatch & { group: OpportunityGroup }

export interface PersonMatches {
  profileId: string
  candidateId: string | null
  name: string
  lastJobTitle: string | null
  grade: string | null
  lwd: Date | null
  createdAt: Date
  positionMatches: PositionMatchView[]
  groupMatches: GroupMatchView[]
}

// Visible matches per ACTIVE person: TalentOS positions only while still assignable to that person
// (open, not fulfilled, not already joined); global groups only while active. Sorted by score.
export async function getVisibleMatches(): Promise<{ people: PersonMatches[]; groupCount: number }> {
  const [groups, profiles] = await Promise.all([
    getActiveOpportunityGroups(),
    db.redeploymentProfile.findMany({
      where: { status: 'ACTIVE', candidateId: { not: null } },
      select: {
        id: true, lwd: true, lastJobTitle: true, grade: true, firstSeenAt: true, preferredName: true, firstName: true, lastName: true,
        candidate: { select: { id: true, firstName: true, lastName: true } },
        opportunityMatches: { orderBy: { score: 'desc' } },
      },
    }),
  ])
  const byKey = new Map(groups.map((g) => [g.groupKey, g]))
  const candidateIds = profiles.map((p) => p.candidate?.id).filter((x): x is string => !!x)
  const assignable = await getAssignablePositionsForCandidates(candidateIds)

  const people = profiles.map((p) => {
    const open = new Map((p.candidate ? assignable.get(p.candidate.id) ?? [] : []).map((a) => [a.id, a]))
    const positionMatches: PositionMatchView[] = []
    const groupMatches: GroupMatchView[] = []
    for (const m of p.opportunityMatches) {
      if (m.targetType === 'TALENTOS_POSITION') {
        const pos = m.positionId ? open.get(m.positionId) : undefined
        if (pos) positionMatches.push({ ...m, position: pos })
      } else {
        const g = m.groupKey ? byKey.get(m.groupKey) : undefined
        if (g) groupMatches.push({ ...m, group: g })
      }
    }
    return {
      profileId: p.id,
      candidateId: p.candidate?.id ?? null,
      name: p.candidate ? `${p.candidate.firstName} ${p.candidate.lastName}`.trim() : [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' '),
      lastJobTitle: p.lastJobTitle,
      grade: p.grade,
      lwd: p.lwd,
      createdAt: p.firstSeenAt,
      positionMatches,
      groupMatches,
    }
  })
  return { people, groupCount: groups.length }
}
