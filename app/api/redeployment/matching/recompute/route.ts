import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { runRedeploymentMatching } from '@/lib/redeployment-matching'

// Starts matching in the background (3 pairs at a time); the Global matches tab shows results as they land
export async function POST() {
  const who = await requireRole(['ADMIN'])
  if (who instanceof NextResponse) return who
  void runRedeploymentMatching().catch((err) => console.error('[redeployment-matching] Recompute failed:', err instanceof Error ? err.message : err))
  return NextResponse.json({ started: true })
}
