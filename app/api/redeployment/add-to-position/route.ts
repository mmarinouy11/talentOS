import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAssignablePositions } from '@/lib/assignable-positions'
import { addCandidateToPosition } from '@/lib/candidate-position-create'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'
import { HIRED_CANDIDATE_POSITION_WHERE, isPositionFulfilled } from '@/lib/position-fulfillment'

const schema = z.object({ candidateId: z.string().min(1), positionId: z.string().min(1) })

// Explains why a position is not assignable (only reached after getAssignablePositions said no)
async function rejectionReason(candidateId: string, positionId: string): Promise<string> {
  const position = await db.position.findUnique({
    where: { id: positionId },
    select: {
      deletedAt: true, status: true, type: true, headcount: true,
      _count: { select: { candidatePositions: { where: HIRED_CANDIDATE_POSITION_WHERE } } },
    },
  })
  if (!position || position.deletedAt) return 'This position no longer exists.'
  const existing = await db.candidatePosition.findFirst({ where: { candidateId, positionId }, select: { id: true } })
  if (existing) return 'This candidate is already in that position.'
  if (position.status !== 'OPEN') return `This position is not open (${position.status.replace('_', ' ').toLowerCase()}).`
  if (position.type !== 'REQUISITION' && position.type !== 'PROACTIVE') return 'Candidates cannot be added to this type of position.'
  if (isPositionFulfilled(position.headcount, position._count.candidatePositions)) return 'This position is already filled.'
  return 'Candidates cannot be added to this position right now.'
}

// Redeployment "Add to position" only: the position must be in getAssignablePositions(candidateId).
// Then the standard add (first stage + StageHistory, recruiter = current user) and real fit scoring.
export async function POST(request: Request) {
  const session = await auth()
  const user = session?.user as { id?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a candidate and a position.' }, { status: 400 })
  const { candidateId, positionId } = parsed.data

  const candidate = await db.candidate.findFirst({ where: { id: candidateId, deletedAt: null }, select: { id: true } })
  if (!candidate) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 })

  const assignable = await getAssignablePositions(candidateId)
  if (!assignable.some((p) => p.id === positionId)) {
    return NextResponse.json({ error: await rejectionReason(candidateId, positionId) }, { status: 409 })
  }

  const cp = await addCandidateToPosition({ candidateId, positionId, recruiterId: user.id, movedById: user.id })
  scoreCandidateForPosition(cp.id).catch(console.error)
  return NextResponse.json(cp, { status: 201 })
}
