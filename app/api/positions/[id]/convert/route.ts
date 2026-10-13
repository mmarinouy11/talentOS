import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ headcount: z.number().int().min(1) })

// POST /api/positions/[id]/convert — turn a proactive position into a requisition
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { id?: string; role?: string }

  const { id } = await params
  const position = await db.position.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, type: true, recruiterId: true },
  })
  if (!position) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (user.role !== 'ADMIN' && user.id !== position.recruiterId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (position.type !== 'PROACTIVE') {
    return NextResponse.json({ error: 'Position is already a requisition' }, { status: 400 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Headcount must be a whole number of at least 1' }, { status: 400 })

  const updated = await db.position.update({
    where: { id },
    data: { type: 'REQUISITION', convertedAt: new Date(), status: 'OPEN', headcount: parsed.data.headcount },
    select: { id: true, type: true, convertedAt: true, status: true, headcount: true },
  })
  return NextResponse.json(updated)
}
