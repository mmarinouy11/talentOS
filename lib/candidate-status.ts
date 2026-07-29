export interface CandidatePositionStatusFields {
  status: string
  stage: string
}

/** A candidate is no longer actively moving through the pipeline if either
 * field says so — status and stage can drift out of sync (interview
 * decisions, legacy on-hold records), so check both. */
export function isCandidateInactive(cp: CandidatePositionStatusFields): boolean {
  return (
    cp.status === 'REJECTED' || cp.status === 'WITHDRAWN' ||
    cp.stage === 'REJECTED' || cp.stage === 'WITHDRAWN'
  )
}
