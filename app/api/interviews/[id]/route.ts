import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { parseTextFeedback } from '@/lib/feedback-parser'
import { sendEmail } from '@/lib/email'
import { resolveEmailTemplate } from '@/lib/email-resolver'

const FEEDBACK_INVITE_DEFAULT_SUBJECT = 'Feedback needed: {{candidateName}} - {{interviewType}} - {{positionTitle}}'
const FEEDBACK_INVITE_DEFAULT_HTML = `<p>Hi,</p>\n<p>Thank you for interviewing <strong>{{candidateName}}</strong> for the <strong>{{positionTitle}}</strong> position ({{interviewType}}).</p>\n<p>Please share your feedback using the link below. It only takes a few minutes and will help us make the best decision:</p>\n<p><a href="{{link}}" style="background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Submit Feedback</a></p>\n<p>This link is valid for 14 days and can only be used once.</p>\n<p>Best,<br/>{{recruiterName}} · Tenarai LATAM</p>`

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
  interviewerEmail: z.string().email().nullable().optional(),
  feedbackText: z.string().nullable().optional(),
  feedbackSummary: z.string().nullable().optional(),
  feedbackStrengths: z.array(z.string()).optional(),
  feedbackConcerns: z.array(z.string()).optional(),
  aiScore: z.number().int().min(1).max(5).nullable().optional(),
  _parsedFromClient: z.boolean().optional(),
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

  const { action, decision, decisionNotes, proposedSlots, _parsedFromClient, ...rest } = parsed.data



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

  // If client already parsed (via Parse button), accept those fields directly.
  // Otherwise parse with Claude if feedbackText changed.
  const newFeedbackText = rest.feedbackText
  let aiFields: Record<string, unknown> = {}

  if (_parsedFromClient && rest.feedbackSummary) {
    // Client sent pre-parsed result — no re-parse needed
    aiFields = {
      feedbackSummary: rest.feedbackSummary,
      feedbackStrengths: rest.feedbackStrengths ?? [],
      feedbackConcerns: rest.feedbackConcerns ?? [],
      aiScore: rest.aiScore ?? null,
      feedbackParseMethod: 'text',
    }
  } else {
    const feedbackChanged =
      newFeedbackText !== undefined &&
      newFeedbackText !== null &&
      newFeedbackText.trim().length > 0 &&
      newFeedbackText.trim() !== (existing.feedbackText ?? '').trim()

    if (feedbackChanged) {
      try {
        const fp = await parseTextFeedback(newFeedbackText!)
        aiFields = {
          feedbackSummary: fp.summary,
          feedbackStrengths: fp.strengths,
          feedbackConcerns: fp.concerns,
          aiScore: fp.score ?? null,
          feedbackParseMethod: 'text',
        }
      } catch (err) {
        console.error('[interview PATCH] Claude feedback parse failed:', err)
      }
    }
  }

  // Strip pre-parsed client fields from rest so they don't double-write
  const { feedbackSummary: _fs, feedbackStrengths: _fst, feedbackConcerns: _fc, aiScore: _as, ...restClean } = rest

  // Generate magic link when transitioning to SCHEDULED for internal technical/manager interviews
  const magicLinkFields: Record<string, unknown> = {}
  const newIsInternal = rest.isInternal !== undefined ? rest.isInternal : existing.isInternal
  const interviewerEmailForLink = rest.interviewerEmail ?? existing.interviewerEmail
  const shouldSendMagicLink =
    newStatus === 'SCHEDULED' &&
    existing.status !== 'SCHEDULED' &&
    !existing.magicLinkToken &&
    interviewerEmailForLink &&
    newIsInternal !== false &&
    (existing.stage === 'TECHNICAL_INTERVIEW' || existing.stage === 'MANAGER_INTERVIEW')

  if (shouldSendMagicLink) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    magicLinkFields.magicLinkToken = token
    magicLinkFields.magicLinkExpiresAt = expiresAt

    // Send invite email async (don't block response)
    const cp = await db.candidatePosition.findUnique({
      where: { id: existing.candidatePositionId },
      include: {
        candidate: { select: { firstName: true, lastName: true } },
        position: { select: { title: true } },
      },
    })
    if (cp) {
      const recruiter = await db.user.findUnique({
        where: { id: (session.user as { id?: string }).id ?? '' },
        select: { id: true, name: true },
      })
      const baseUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
      const feedbackUrl = `${baseUrl}/feedback/${token}`
      const candidateName = `${cp.candidate.firstName} ${cp.candidate.lastName}`
      const INTERVIEW_TYPE_LABELS: Record<string, string> = {
        TECHNICAL_INTERVIEW: 'Technical Interview',
        MANAGER_INTERVIEW: 'Manager Interview',
      }
      const interviewTypeLabel = INTERVIEW_TYPE_LABELS[existing.stage] ?? existing.stage
      const { subject, html } = await resolveEmailTemplate(
        'TEMPLATE_FEEDBACK_INVITE',
        FEEDBACK_INVITE_DEFAULT_SUBJECT,
        FEEDBACK_INVITE_DEFAULT_HTML,
        {
          candidateName,
          positionTitle: cp.position.title,
          interviewType: interviewTypeLabel,
          link: feedbackUrl,
          recruiterName: recruiter?.name ?? 'The Recruiting Team',
        }
      )
      void sendEmail({
        to: interviewerEmailForLink!,
        subject,
        html,
        template: 'interviewer_invite',
        userId: (session.user as { id?: string }).id,
        interviewId: id,
      }).then((r) => { if (!r.success) console.error('[interview PATCH] Failed to send magic link email:', r.error) })
        .catch((err) => console.error('[interview PATCH] Unexpected error sending magic link email:', err))
    }
  }

  const interview = await db.interview.update({
    where: { id },
    data: {
      ...restClean,
      status: newStatus,
      scheduledAt: restClean.scheduledAt !== undefined ? (restClean.scheduledAt ? new Date(restClean.scheduledAt) : null) : undefined,
      proposedSlots: proposedSlots !== undefined ? proposedSlots.map((s) => new Date(s)) : undefined,
      ...decidedFields,
      ...aiFields,
      ...magicLinkFields,
    },
    include: { decidedBy: { select: { name: true, email: true } } },
  })

  // Sync CandidatePosition when a terminal decision is recorded — REJECT and
  // HOLD both move the candidate out of the active pipeline; must update
  // stage AND status together, and log to StageHistory for auditability.
  if (decision === 'REJECT' || decision === 'HOLD') {
    const targetStage = decision === 'REJECT' ? 'REJECTED' : 'WITHDRAWN'
    const currentCp = await db.candidatePosition.findUnique({
      where: { id: existing.candidatePositionId },
      select: { stage: true },
    })
    await db.candidatePosition.update({
      where: { id: existing.candidatePositionId },
      data: { status: targetStage, stage: targetStage, stageEnteredAt: new Date() },
    })
    if (currentCp) {
      await db.stageHistory.create({
        data: {
          candidatePositionId: existing.candidatePositionId,
          fromStage: currentCp.stage,
          toStage: targetStage,
          movedById: (session.user as { id?: string }).id ?? '',
          notes: decisionNotes ?? (decision === 'REJECT' ? 'Rejected via interview decision' : 'Put on hold via interview decision'),
        },
      })
    }
  }

  return NextResponse.json(interview)
}

