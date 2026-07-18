import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { resolveEmailTemplate } from '@/lib/email-resolver'

const FEEDBACK_NOTIF_DEFAULT_SUBJECT = 'Feedback received: {{candidateName}} — {{interviewType}}'
const FEEDBACK_NOTIF_DEFAULT_HTML = `<p>Hi {{recruiterName}},</p>\n<p>Feedback has been submitted for <strong>{{candidateName}}</strong> ({{interviewType}}) for the <strong>{{positionTitle}}</strong> role.</p>\n<p><a href="{{link}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Feedback</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`

const submitSchema = z.object({
  overallScore: z.number().int().min(1).max(5),
  generalNotes: z.string().optional().default(''),
  skillRatings: z.array(z.object({
    skillName: z.string().min(1),
    rating: z.number().int().min(0).max(5),
    comment: z.string().optional().default(''),
  })).optional().default([]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const interview = await db.interview.findUnique({
    where: { magicLinkToken: token },
  })

  if (!interview) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (interview.magicLinkUsedAt) return NextResponse.json({ error: 'Feedback already submitted' }, { status: 409 })
  if (interview.magicLinkExpiresAt && interview.magicLinkExpiresAt < new Date()) {
    return NextResponse.json({ error: 'Link has expired' }, { status: 410 })
  }

  const body = await req.json().catch(() => null)
  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { overallScore, generalNotes, skillRatings } = parsed.data

  await db.$transaction(async (tx) => {
    if (skillRatings.length > 0) {
      await tx.interviewSkillRating.createMany({
        data: skillRatings
          .filter((sr) => sr.rating > 0)
          .map((sr) => ({
            interviewId: interview.id,
            skillName: sr.skillName,
            rating: sr.rating,
            comment: sr.comment || null,
          })),
      })
    }

    await tx.interview.update({
      where: { id: interview.id },
      data: {
        humanScore: overallScore,
        feedbackSummary: generalNotes || null,
        feedbackParseMethod: 'interviewer_form',
        magicLinkUsedAt: new Date(),
        status: 'COMPLETED',
      },
    })
  })

  // Send notification to candidate's recruiter
  try {
    const INTERVIEW_TYPE_LABELS: Record<string, string> = {
      TECHNICAL_INTERVIEW: 'Technical Interview',
      MANAGER_INTERVIEW: 'Manager Interview',
    }
    const cp = await db.candidatePosition.findUnique({
      where: { id: interview.candidatePositionId },
      include: {
        candidate: { select: { firstName: true, lastName: true, recruiterId: true } },
        position: { select: { id: true, title: true } },
      },
    })
    if (cp?.candidate.recruiterId) {
      const recruiter = await db.user.findUnique({
        where: { id: cp.candidate.recruiterId },
        select: { id: true, email: true, name: true },
      })
      if (recruiter) {
        const scoreLabel = `${overallScore}/5 ${'★'.repeat(overallScore)}${'☆'.repeat(5 - overallScore)}`
        const baseUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
        const link = `${baseUrl}/positions/${cp.position.id}/candidates/${interview.candidatePositionId}?openInterview=${interview.id}`
        const { subject, html } = await resolveEmailTemplate(
          'TEMPLATE_FEEDBACK_NOTIFICATION',
          FEEDBACK_NOTIF_DEFAULT_SUBJECT,
          FEEDBACK_NOTIF_DEFAULT_HTML,
          {
            recruiterName: recruiter.name ?? recruiter.email,
            candidateName: `${cp.candidate.firstName} ${cp.candidate.lastName}`,
            positionTitle: cp.position.title,
            interviewType: INTERVIEW_TYPE_LABELS[interview.stage] ?? interview.stage,
            link,
          }
        )
        sendEmailViaSystemGmail({ to: recruiter.email, subject, html })
          .catch((err) => console.error('[feedback submit] Failed to send notification:', err))
      }
    }
  } catch (err) {
    console.error('[feedback submit] Notification error:', err)
  }

  return NextResponse.json({ ok: true })
}
