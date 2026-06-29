import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
import { rejectionEmail, renderTemplate } from '@/lib/email-templates'

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
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          position: { select: { id: true, title: true, client: true } },
          recruiter: { select: { id: true, name: true, email: true, rejectionEmailTemplate: true } },
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
    const tokens: Record<string, string> = {
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      positionTitle: position.title,
      clientName: 'Tenarai',
      recruiterName,
      roundLabel: '',
      schedulingLink: '',
      slotsList: '',
      nextRoundLabel: '',
    }
    if (recruiter.rejectionEmailTemplate) {
      subject = `Update on your application - ${position.title} - ${candidate.firstName} ${candidate.lastName}`
      html = renderTemplate(recruiter.rejectionEmailTemplate, tokens)
    } else {
      const result = rejectionEmail({
        candidateName: tokens.candidateName,
        positionTitle: position.title,
        client: position.client,
        recruiterName,
      })
      subject = result.subject
      html = result.html
    }
  }

  const recruiterId = recruiter.id
  const sendResult = await sendEmail({
    to: candidate.email,
    subject,
    html,
    template: 'rejection',
    candidateId: candidate.id,
    candidatePositionId: cp.id,
    interviewId: interview.id,
    sentById: (session.user as { id?: string }).id,
    userId: recruiterId,
  })
  if (!sendResult.success) {
    return NextResponse.json({ error: sendResult.error ?? 'Send failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
