import { db } from './db'

export function calculateDGM(clientRate: number, internalCostBudget: number): number {
  if (clientRate <= 0) return 0
  return (clientRate - internalCostBudget) / clientRate
}

export async function getMinDGMThreshold(): Promise<number> {
  try {
    const setting = await db.systemSettings.findUnique({ where: { key: 'MIN_DGM_PERCENT' } })
    return setting ? parseFloat(setting.value) / 100 : 0.40
  } catch {
    return 0.40
  }
}

export async function computePositionDGM(
  clientRate: number | null | undefined,
  internalCostBudget: number | null | undefined
): Promise<{ dgm: number | null; dgmAtRisk: boolean }> {
  if (!clientRate || !internalCostBudget) return { dgm: null, dgmAtRisk: false }
  const dgm = calculateDGM(clientRate, internalCostBudget)
  const threshold = await getMinDGMThreshold()
  return { dgm, dgmAtRisk: dgm < threshold }
}
