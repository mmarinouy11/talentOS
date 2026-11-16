import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/role-guard'

const schema = z.union([
  z.object({ targetType: z.literal('GLOBAL_GROUP'), groupKey: z.string().min(1), reason: z.string().trim().max(500).optional().nullable() }),
  z.object({ targetType: z.literal('TALENTOS_POSITION'), positionId: z.string().min(1), reason: z.string().trim().max(500).optional().nullable() }),
])

// "Exclude for everyone": matching skips the target; existing matches are hidden, not deleted.
// Does not affect Find Candidates or anything else on a TalentOS position.
export async function POST(request: Request) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  const d = parsed.data
  const existing = await db.matchTargetExclusion.findFirst({
    where: d.targetType === 'GLOBAL_GROUP' ? { targetType: d.targetType, groupKey: d.groupKey } : { targetType: d.targetType, positionId: d.positionId },
  })
  if (existing) return NextResponse.json({ ok: true, id: existing.id })
  const row = await db.matchTargetExclusion.create({
    data: {
      targetType: d.targetType,
      groupKey: d.targetType === 'GLOBAL_GROUP' ? d.groupKey : null,
      positionId: d.targetType === 'TALENTOS_POSITION' ? d.positionId : null,
      reason: d.reason || null,
      excludedById: who.id,
    },
  })
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 })
}
