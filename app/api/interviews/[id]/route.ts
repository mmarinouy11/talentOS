import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const patchSchema = z.object({
  status: z.enum(['PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  roundLabel: z.string().min(1).optional(),
  roundNumber: z.number().int().min(1).optional(),
  isInternal: z.boolean().optional(),
  feedbackText: z.string().nullable().optional(),
  feedbackSummary: z.string().nullable().optional(),
  feedbackStrengths: z.array(z.string()).optional(),
  feedbackConcerns: z.array(z.string()).optional(),
  decision: z.enum(['ADVANCE', 'REJECT', 'HOLD']).nullable().optional(),
  decisionNotes: z.string().nullable().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const existing = await db.interview.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { decision, decisionNotes, ...rest } = parsed.data

  const decidedFields =
    decision !== undefined
      ? {
          decision,
          decisionNotes: decisionNotes ?? null,
          decidedAt: decision !== null ? new Date() : null,
          decidedById: decision !== null ? (session.user as { id?: string }).id ?? null : null,
        }
      : {}

  const interview = await db.interview.update({
    where: { id },
    data: {
      ...rest,
      scheduledAt: rest.scheduledAt !== undefined ? (rest.scheduledAt ? new Date(rest.scheduledAt) : null) : undefined,
      ...decidedFields,
    },
    include: { decidedBy: { select: { name: true, email: true } } },
  })

  return NextResponse.json(interview)
}
