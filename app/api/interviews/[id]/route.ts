import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const patchSchema = z.object({
  action: z.literal('cancel').optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  schedulingMode: z.enum(['MANUAL_SLOTS', 'CALENDAR_LINK']).nullable().optional(),
  proposedSlots: z.array(z.string().datetime()).optional(),
  calendarLinkUsed: z.string().nullable().optional(),
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

import type { InterviewStatus } from '@prisma/client'

function deriveStatus(
  existing: { status: string },
  data: {
    action?: 'cancel'
    scheduledAt?: string | null
    feedbackText?: string | null
  }
): InterviewStatus {
  if (data.action === 'cancel') return 'CANCELLED'

  const currentStatus = existing.status as InterviewStatus

  // Feedback being set → COMPLETED
  if (data.feedbackText && data.feedbackText.trim().length > 0) {
    return 'COMPLETED'
  }

  // scheduledAt being set → SCHEDULED (only if not already past those states)
  if (data.scheduledAt != null) {
    if (currentStatus === 'PENDING' || currentStatus === 'AWAITING_SCHEDULE') {
      return 'SCHEDULED'
    }
  }

  return currentStatus
}

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

  const { action, decision, decisionNotes, proposedSlots, ...rest } = parsed.data

  const newStatus = deriveStatus(existing, { action, scheduledAt: rest.scheduledAt, feedbackText: rest.feedbackText })

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
      status: newStatus,
      scheduledAt: rest.scheduledAt !== undefined ? (rest.scheduledAt ? new Date(rest.scheduledAt) : null) : undefined,
      proposedSlots: proposedSlots !== undefined ? proposedSlots.map((s) => new Date(s)) : undefined,
      ...decidedFields,
    },
    include: { decidedBy: { select: { name: true, email: true } } },
  })

  return NextResponse.json(interview)
}
