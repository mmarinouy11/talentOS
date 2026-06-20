import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const createSchema = z.object({
  stage: z.enum(['APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER', 'HIRED']),
  roundLabel: z.string().min(1),
  roundNumber: z.number().int().min(1),
  isInternal: z.boolean().default(true),
  scheduledAt: z.string().datetime().optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const interviews = await db.interview.findMany({
    where: { candidatePositionId: id },
    include: { decidedBy: { select: { name: true, email: true } } },
    orderBy: [{ roundNumber: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json(interviews)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const cp = await db.candidatePosition.findUnique({ where: { id } })
  if (!cp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const interview = await db.interview.create({
    data: {
      candidatePositionId: id,
      stage: parsed.data.stage,
      roundLabel: parsed.data.roundLabel,
      roundNumber: parsed.data.roundNumber,
      isInternal: parsed.data.isInternal,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
    },
    include: { decidedBy: { select: { name: true, email: true } } },
  })

  return NextResponse.json(interview, { status: 201 })
}
