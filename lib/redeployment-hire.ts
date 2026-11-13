import { db } from './db'

const BACKFILL_KEY = 'REDEPLOYMENT_HIRE_BACKFILL'
export const REDEPLOYMENT_HIRE_WEIGHT_DEFAULT = 2

// Call right after a CandidatePosition BECOMES hired (status or stage HIRED). Sets redeploymentHire once when the
// candidate has an ACTIVE or OUT_OF_WINDOW redeployment profile at that moment; never cleared or re-evaluated.
export async function markRedeploymentHire(candidatePositionId: string): Promise<void> {
  try {
    await db.candidatePosition.updateMany({
      where: {
        id: candidatePositionId,
        redeploymentHire: false,
        OR: [{ status: 'HIRED' }, { stage: 'HIRED' }],
        candidate: { redeploymentProfile: { status: { in: ['ACTIVE', 'OUT_OF_WINDOW'] } } },
      },
      data: { redeploymentHire: true },
    })
  } catch (err) {
    console.error(`[redeployment-hire] Could not flag candidatePosition ${candidatePositionId}:`, err instanceof Error ? err.message : err)
  }
}

// One-time backfill (guarded by a SystemSettings marker, so it never runs twice): hired candidate-positions
// whose candidate has a redeployment profile
export async function runRedeploymentHireBackfill(): Promise<void> {
  try {
    const done = await db.systemSettings.findUnique({ where: { key: BACKFILL_KEY } })
    if (done) return
    const { count } = await db.candidatePosition.updateMany({
      where: { redeploymentHire: false, OR: [{ status: 'HIRED' }, { stage: 'HIRED' }], candidate: { redeploymentProfile: { isNot: null } } },
      data: { redeploymentHire: true },
    })
    await db.systemSettings.create({
      data: { key: BACKFILL_KEY, value: JSON.stringify({ at: new Date().toISOString(), marked: count }), description: 'One-time redeployment hire backfill (managed automatically).' },
    })
    console.log(`[redeployment-hire] Backfill marked ${count} hire(s) as redeployment hires`)
  } catch (err) {
    console.error('[redeployment-hire] Backfill failed (will retry on next start):', err instanceof Error ? err.message : err)
  }
}

export async function getRedeploymentHireWeight(): Promise<number> {
  const row = await db.systemSettings.upsert({
    where: { key: 'REDEPLOYMENT_HIRE_WEIGHT' },
    update: {},
    create: { key: 'REDEPLOYMENT_HIRE_WEIGHT', value: String(REDEPLOYMENT_HIRE_WEIGHT_DEFAULT), description: 'Recruiter Performance only: a redeployment hire counts this many closures (normal hire = 1).' },
  })
  const n = Number(row.value)
  return Number.isFinite(n) && n >= 0 ? n : REDEPLOYMENT_HIRE_WEIGHT_DEFAULT
}
