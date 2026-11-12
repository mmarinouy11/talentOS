import { db } from './db'

// Adds a candidate to a position at the first stage (APPLIED) with its StageHistory entry.
// Shared by POST /api/candidate-positions and the bulk CV upload confirm step. Does not score.
export async function addCandidateToPosition(input: {
  candidateId: string
  positionId: string
  recruiterId: string
  movedById: string
  notes?: string | null
}) {
  const cp = await db.candidatePosition.create({
    data: {
      candidateId: input.candidateId,
      positionId: input.positionId,
      stage: 'APPLIED',
      stageEnteredAt: new Date(),
      notes: input.notes ?? null,
      recruiterId: input.recruiterId,
    },
    select: {
      id: true,
      createdAt: true,
      candidate: { select: { id: true, firstName: true, lastName: true, email: true, country: true, seniority: true } },
    },
  })
  await db.stageHistory.create({
    data: { candidatePositionId: cp.id, fromStage: null, toStage: 'APPLIED', movedById: input.movedById, notes: input.notes ?? null },
  })
  return cp
}
