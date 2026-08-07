import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: positionId } = await params
  const userId = (session.user as { id: string }).id

  const body = await request.json()
  const candidateIds: string[] = body.candidateIds ?? []

  if (!candidateIds.length) {
    return NextResponse.json({ error: 'No candidates provided' }, { status: 400 })
  }

  const position = await db.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { id: true, recruiterId: true },
  })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  const recruiterId = position.recruiterId ?? userId

  // Avoid duplicates
  const existing = await db.candidatePosition.findMany({
    where: { positionId, candidateId: { in: candidateIds } },
    select: { candidateId: true },
  })
  const existingIds = new Set(existing.map((cp) => cp.candidateId))
  const toAdd = candidateIds.filter((id) => !existingIds.has(id))

  const created: { id: string; candidateId: string }[] = []
  for (const candidateId of toAdd) {
    const cp = await db.candidatePosition.create({
      data: {
        candidateId,
        positionId,
        stage: 'APPLIED',
        stageEnteredAt: new Date(),
        recruiterId,
      },
      select: {
        id: true,
        createdAt: true,
        candidateId: true,
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true, country: true, seniority: true },
        },
      },
    })

    await db.stageHistory.create({
      data: {
        candidatePositionId: cp.id,
        fromStage: null,
        toStage: 'APPLIED',
        movedById: userId,
      },
    })

    created.push(cp)
    scoreCandidateForPosition(cp.id).catch(console.error)
  }

  return NextResponse.json({ added: created }, { status: 201 })
}
