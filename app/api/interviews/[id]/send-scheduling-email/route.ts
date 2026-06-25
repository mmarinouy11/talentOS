import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
import { schedulingRequestEmail, buildSchedulingTokens, renderTemplate } from '@/lib/email-templates'

const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  SCREENING: 'Screening Interview',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer Discussion',
}

const bodySchema = z.object({
  subject: z.string().optional(),
  html: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const interview = await db.interview.findUnique({
    where: { id },
    include: {
      candidatePosition: {
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true, country: true } },
          position: { select: { id: true, title: true, client: true } },
          recruiter: { select: { id: true, name: true, email: true, schedulingEmailTemplate: true } },
        },
      },
    },
  })

  if (!interview) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { candidatePosition: cp } = interview
  const { candidate, position, recruiter } = cp

  const recruiterName = recruiter.name ?? recruiter.email

  let subject: string
  let html: string

  if (parsed.data.subject && parsed.data.html) {
    subject = parsed.data.subject
    html = parsed.data.html
  } else {
    const tokens = buildSchedulingTokens({
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      positionTitle: position.title,
      clientName: position.client,
      recruiterName,
      roundLabel: interview.roundLabel,
      slots: interview.proposedSlots.map((d) => d.toISOString()),
      calendarLink: interview.calendarLinkUsed,
      candidateCountry: candidate.country,
      durationMinutes: interview.durationMinutes,
    })

    const template = recruiter.schedulingEmailTemplate
    const interviewTypeLabel = INTERVIEW_TYPE_LABELS[interview.stage] ?? 'Interview'
    const candidateName = `${candidate.firstName} ${candidate.lastName}`
    if (template) {
      subject = `${interviewTypeLabel} - ${position.title} - ${candidateName}`
      html = renderTemplate(template, tokens)
    } else {
      const result = schedulingRequestEmail({
        candidateName,
        positionTitle: position.title,
        client: position.client,
        roundLabel: interview.roundLabel,
        recruiterName,
        interviewTypeLabel,
      })
      subject = result.subject
      html = result.html
    }
  }

  const recruiterId = recruiter.id
  try {
    await sendEmail({
      to: candidate.email,
      subject,
      html,
      template: 'scheduling_request',
      candidateId: candidate.id,
      candidatePositionId: cp.id,
      interviewId: interview.id,
      sentById: (session.user as { id?: string }).id,
      userId: recruiterId,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send failed' }, { status: 500 })
  }

  const updated = await db.interview.update({
    where: { id },
    data: { status: 'AWAITING_SCHEDULE' },
    include: { decidedBy: { select: { name: true, email: true } } },
  })

  return NextResponse.json(updated)
}
