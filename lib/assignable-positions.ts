import { db } from './db'
import { HIRED_CANDIDATE_POSITION_WHERE, isPositionFulfilled } from './position-fulfillment'

export type AssignablePosition = { id: string; title: string; client: string; type: 'REQUISITION' | 'PROACTIVE' }

// Positions that can take a new candidate: not deleted, OPEN (no ON_HOLD / FILLED / CLOSED / CANCELLED),
// REQUISITION or PROACTIVE, not fulfilled. Sorted by title.
async function getOpenUnfulfilledPositions(): Promise<AssignablePosition[]> {
  const rows = await db.position.findMany({
    where: { deletedAt: null, status: 'OPEN', type: { in: ['REQUISITION', 'PROACTIVE'] } },
    select: {
      id: true, title: true, client: true, type: true, headcount: true,
      _count: { select: { candidatePositions: { where: HIRED_CANDIDATE_POSITION_WHERE } } },
    },
  })
  return rows
    .filter((p) => !isPositionFulfilled(p.headcount, p._count.candidatePositions))
    .map((p) => ({ id: p.id, title: p.title, client: p.client, type: p.type }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.client.localeCompare(b.client))
}

// Per candidate: the assignable positions minus those where the candidate already has a CandidatePosition
// (any status). One query for positions and one for existing links, whatever the number of candidates.
export async function getAssignablePositionsForCandidates(candidateIds: string[]): Promise<Map<string, AssignablePosition[]>> {
  const [positions, links] = await Promise.all([
    getOpenUnfulfilledPositions(),
    candidateIds.length > 0
      ? db.candidatePosition.findMany({ where: { candidateId: { in: candidateIds } }, select: { candidateId: true, positionId: true } })
      : Promise.resolve([]),
  ])
  const taken = new Map<string, Set<string>>()
  for (const l of links) {
    if (!taken.has(l.candidateId)) taken.set(l.candidateId, new Set())
    taken.get(l.candidateId)!.add(l.positionId)
  }
  return new Map(candidateIds.map((id) => [id, positions.filter((p) => !taken.get(id)?.has(p.id))]))
}

export async function getAssignablePositions(candidateId: string): Promise<AssignablePosition[]> {
  return (await getAssignablePositionsForCandidates([candidateId])).get(candidateId) ?? []
}
