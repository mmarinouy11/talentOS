import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/role-guard'
import { scheduleRedeploymentMatching } from '@/lib/redeployment-matching'

const schema = z.object({ reason: z.string().trim().max(500).optional().nullable() })

// Exclude a person from matching (reversible). Keeps their current LWD so a new LWD reactivates them on sync.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  const profile = await db.redeploymentProfile.findUnique({ where: { id }, select: { lwd: true } })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.redeploymentProfile.update({
    where: { id },
    data: { excludedFromMatching: true, excludedReason: parsed.data.reason || null, excludedAt: new Date(), excludedById: who.id, excludedLwd: profile.lwd },
  })
  return NextResponse.json({ ok: true })
}

// Reactivate: matching recalculates on the next run (cached scores avoid repeated AI calls)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  await db.redeploymentProfile.update({
    where: { id },
    data: { excludedFromMatching: false, excludedReason: null, excludedAt: null, excludedById: null, excludedLwd: null },
  })
  scheduleRedeploymentMatching(`profile ${id} reactivated`)
  return NextResponse.json({ ok: true })
}
