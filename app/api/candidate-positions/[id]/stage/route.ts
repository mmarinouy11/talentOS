import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  newStage: z.enum(['APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']).optional(),
  action: z.enum(['on_hold']).optional(),
  notes: z.string().optional().nullable(),
}).refine((d) => d.newStage !== undefined || d.action !== undefined, {
  message: 'Either newStage or action is required',
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

  const { newStage, action, notes } = parsed.data
  const userId = (session.user as { id?: string }).id!

  let updated
  if (action === 'on_hold') {
    updated = await db.candidatePosition.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
    })
  } else {
    const stage = newStage!
    const statusUpdate =
      stage === 'HIRED' ? { status: 'HIRED' as const } :
      stage === 'REJECTED' ? { status: 'REJECTED' as const } :
      cp.status === 'WITHDRAWN' ? { status: 'ACTIVE' as const } :
      {}

    updated = await db.candidatePosition.update({
      where: { id },
      data: { stage, stageEnteredAt: new Date(), ...statusUpdate },
    })

    await db.stageHistory.create({
      data: {
        candidatePositionId: id,
        fromStage: cp.stage,
        toStage: stage,
        movedById: userId,
        notes,
      },
    })
  }

  return NextResponse.json(updated)
}
