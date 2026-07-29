import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  newStage: z.enum(['APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN']),
  notes: z.string().optional().nullable(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const cp = await db.candidatePosition.findFirst({ where: { id } })
  if (!cp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { newStage, notes } = parsed.data
  const userId = (session.user as { id?: string }).id!

  const statusUpdate =
    newStage === 'HIRED' ? { status: 'HIRED' as const } :
    newStage === 'REJECTED' ? { status: 'REJECTED' as const } :
    newStage === 'WITHDRAWN' ? { status: 'WITHDRAWN' as const } :
    { status: 'ACTIVE' as const }

  const updated = await db.candidatePosition.update({
    where: { id },
    data: { stage: newStage, stageEnteredAt: new Date(), ...statusUpdate },
  })

  await db.stageHistory.create({
    data: {
      candidatePositionId: id,
      fromStage: cp.stage,
      toStage: newStage,
      movedById: userId,
      notes,
    },
  })

  return NextResponse.json(updated)
}
