import { db } from './db'

export async function getMonthlyHoursBaseline(): Promise<number> {
  try {
    const setting = await db.systemSettings.findUnique({ where: { key: 'MONTHLY_HOURS_BASELINE' } })
    return setting ? parseFloat(setting.value) : 168
  } catch {
    return 168
  }
}

export function hourlyToMonthly(hourlyRate: number, hoursBaseline: number): number {
  return hourlyRate * hoursBaseline
}

export function monthlyToHourly(monthlyRate: number, hoursBaseline: number): number {
  return monthlyRate / hoursBaseline
}

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
  // Round to 3 decimal places before comparing so a displayed "40.0%" (0.3999... stored)
  // is never incorrectly flagged when threshold is exactly 40%.
  const dgmRounded = Math.round(dgm * 1000) / 1000
  const thresholdRounded = Math.round(threshold * 1000) / 1000
  return { dgm, dgmAtRisk: dgmRounded < thresholdRounded }
}
