export type PipelineStage =
  | 'APPLIED'
  | 'SCREENING'
  | 'TECHNICAL_INTERVIEW'
  | 'MANAGER_INTERVIEW'
  | 'CLIENT_INTERVIEW'
  | 'OFFER'
  | 'HIRED'

export const STAGE_SEQUENCE: PipelineStage[] = [
  'APPLIED',
  'SCREENING',
  'TECHNICAL_INTERVIEW',
  'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW',
  'OFFER',
  'HIRED',
]

export function getNextStage(currentStage: PipelineStage): PipelineStage | null {
  const idx = STAGE_SEQUENCE.indexOf(currentStage)
  if (idx === -1 || idx === STAGE_SEQUENCE.length - 1) return null
  return STAGE_SEQUENCE[idx + 1]
}
