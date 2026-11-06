import type { Prisma } from '@prisma/client'

// A candidate counts as hired when either their status or their stage is HIRED
export function isHiredCandidatePosition(cp: { status: string; stage: string }): boolean {
  return cp.status === 'HIRED' || cp.stage === 'HIRED'
}

// Same rule for Prisma count/where queries
export const HIRED_CANDIDATE_POSITION_WHERE: Prisma.CandidatePositionWhereInput = {
  OR: [{ status: 'HIRED' }, { stage: 'HIRED' }],
}

// A position is fulfilled when its hired candidates cover its headcount (null headcount = 1)
export function isPositionFulfilled(headcount: number | null, hiredCount: number): boolean {
  return hiredCount >= (headcount ?? 1)
}
