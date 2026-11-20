import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/role-guard'
import { scheduleRedeploymentMatching } from '@/lib/redeployment-matching'

// Reactivate a target: its hidden matches show again and matching includes it on the next run
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  await db.matchTargetExclusion.delete({ where: { id } }).catch(() => null)
  scheduleRedeploymentMatching('target exclusion removed')
  return NextResponse.json({ ok: true })
}
