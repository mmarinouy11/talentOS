import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callClaudeJSON } from '@/lib/anthropic'

const MANUAL_FEEDBACK_SYSTEM_PROMPT = `You are parsing interview feedback for a recruiting platform. The input may be either:
(a) Detailed notes or a transcript from the interview, OR
(b) A short, already-condensed assessment written by the interviewer/recruiter (e.g. "Strong technical skills, weak communication, would advance")

If input is type (b) — short and already conclusion-level — treat it AS the summary itself. Do not pad it out, do not claim information is missing just because it's brief. Extract whatever specific strengths/concerns ARE stated, even if there are only one or two.

If input is type (a) — longer and more conversational — synthesize a proper summary from it as usual.

Extract structured information and return ONLY valid JSON, no markdown:
{
  "summary": "2-3 sentences; if input was already short/conclusive, mirror the original phrasing rather than inventing detail",
  "strengths": ["whatever positive points are stated, can be as few as 1"],
  "concerns": ["whatever concerns are stated, empty array if none"],
  "recommendedDecision": "ADVANCE | REJECT | UNCLEAR"
}
Rules:
- Never claim "insufficient information" if there is ANY substantive content, even a single sentence
- Only return minimal/empty fields if the input is truly empty or has zero substantive content
- May be in English or Spanish
- No markdown, no explanation, only the JSON object`

interface FeedbackParse {
  summary: string
  strengths: string[]
  concerns: string[]
  recommendedDecision: 'ADVANCE' | 'REJECT' | 'UNCLEAR'
}

const patchSchema = z.object({
  action: z.literal('cancel').optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  schedulingMode: z.enum(['MANUAL_SLOTS', 'CALENDAR_LINK']).nullable().optional(),
  proposedSlots: z.array(z.string().datetime()).optional(),
  calendarLinkUsed: z.string().nullable().optional(),
  roundLabel: z.string().min(1).optional(),
  roundNumber: z.number().int().min(1).optional(),
  durationMinutes: z.number().int().min(1).nullable().optional(),
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

  // Determine if feedbackText actually changed and has content — if so, parse with Claude
  const newFeedbackText = rest.feedbackText
  const feedbackChanged =
    newFeedbackText !== undefined &&
    newFeedbackText !== null &&
    newFeedbackText.trim().length > 0 &&
    newFeedbackText.trim() !== (existing.feedbackText ?? '').trim()

  let aiFields: Record<string, unknown> = {}
  if (feedbackChanged) {
    try {
      const feedbackParse = await callClaudeJSON<FeedbackParse>(
        `Parse this interview feedback:\n\n${newFeedbackText}`,
        'FAST',
        MANUAL_FEEDBACK_SYSTEM_PROMPT
      )
      const aiRecommendedDecision =
        feedbackParse.recommendedDecision === 'ADVANCE' || feedbackParse.recommendedDecision === 'REJECT'
          ? feedbackParse.recommendedDecision
          : null
      aiFields = {
        feedbackSummary: feedbackParse.summary,
        feedbackStrengths: feedbackParse.strengths,
        feedbackConcerns: feedbackParse.concerns,
        aiRecommendedDecision,
        feedbackParseMethod: 'text',
      }
    } catch (err) {
      console.error('[interview PATCH] Claude feedback parse failed:', err)
      // Non-fatal — save the raw text without structured parse
    }
  }

  const interview = await db.interview.update({
    where: { id },
    data: {
      ...rest,
      status: newStatus,
      scheduledAt: rest.scheduledAt !== undefined ? (rest.scheduledAt ? new Date(rest.scheduledAt) : null) : undefined,
      proposedSlots: proposedSlots !== undefined ? proposedSlots.map((s) => new Date(s)) : undefined,
      ...decidedFields,
      ...aiFields,
    },
    include: { decidedBy: { select: { name: true, email: true } } },
  })

  return NextResponse.json(interview)
}

