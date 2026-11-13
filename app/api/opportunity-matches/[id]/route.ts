import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/role-guard'

const schema = z.object({
  action: z.enum(['propose', 'dismiss', 'reopen']),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  const { id } = await params
  const match = await db.opportunityMatch.findUnique({ where: { id }, select: { id: true } })
  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { action, notes } = parsed.data
  const now = new Date()
  const data = action === 'propose'
    ? { status: 'PROPOSED' as const, proposedAt: now, proposedById: who.id, dismissedAt: null, ...(notes !== undefined ? { notes: notes || null } : {}) }
    : action === 'dismiss'
      ? { status: 'DISMISSED' as const, dismissedAt: now }
      : { status: 'NEW' as const, dismissedAt: null, proposedAt: null, proposedById: null }
  const updated = await db.opportunityMatch.update({ where: { id }, data })
  return NextResponse.json({ id: updated.id, status: updated.status })
}
