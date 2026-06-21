import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

const createSchema = z.object({
  stage: z.enum(['APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']),
  schedulingMode: z.enum(['MANUAL_SLOTS', 'CALENDAR_LINK']).optional().nullable(),
  proposedSlots: z.array(z.string().datetime()).optional(),
  calendarLinkUsed: z.string().optional().nullable(),
  durationMinutes: z.number().int().min(1).optional().nullable(),
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

  const [existingForStage, existingTotal] = await Promise.all([
    db.interview.count({ where: { candidatePositionId: id, stage: parsed.data.stage } }),
    db.interview.count({ where: { candidatePositionId: id } }),
  ])

  const baseLabel = STAGE_LABELS[parsed.data.stage] ?? parsed.data.stage
  const roundLabel = existingForStage === 0 ? baseLabel : `${baseLabel} - Round ${existingForStage + 1}`
  const roundNumber = existingTotal + 1

  const interview = await db.interview.create({
    data: {
      candidatePositionId: id,
      stage: parsed.data.stage,
      roundLabel,
      roundNumber,
      isInternal: true,
      schedulingMode: parsed.data.schedulingMode ?? null,
      proposedSlots: parsed.data.proposedSlots?.map((s) => new Date(s)) ?? [],
      calendarLinkUsed: parsed.data.calendarLinkUsed ?? null,
      durationMinutes: parsed.data.durationMinutes ?? null,
    },
    include: { decidedBy: { select: { name: true, email: true } } },
  })

  return NextResponse.json(interview, { status: 201 })
}
