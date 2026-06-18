import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'

const schema = z.object({
  candidateId: z.string(),
  positionId: z.string(),
  notes: z.string().optional().nullable(),
  recruiterId: z.string().optional().nullable(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { candidateId, positionId, notes, recruiterId } = parsed.data

  const existing = await db.candidatePosition.findFirst({
    where: { candidateId, positionId },
  })
  if (existing) {
    return NextResponse.json({ error: 'Candidate already added to this position.' }, { status: 409 })
  }

  const userId = (session.user as { id?: string }).id!
  const resolvedRecruiterId = recruiterId ?? userId

  const cp = await db.candidatePosition.create({
    data: {
      candidateId,
      positionId,
      stage: 'APPLIED',
      stageEnteredAt: new Date(),
      notes,
      recruiterId: resolvedRecruiterId,
    },
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true, email: true, seniority: true } },
    },
  })

  await db.stageHistory.create({
    data: {
      candidatePositionId: cp.id,
      fromStage: null,
      toStage: 'APPLIED',
      movedById: userId,
      notes,
    },
  })

  scoreCandidateForPosition(cp.id).catch(console.error)

  return NextResponse.json(cp, { status: 201 })
}
