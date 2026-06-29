import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail } from '@/lib/email'
import {
  schedulingRequestEmail,
  rejectionEmail,
  advanceNotificationEmail,
} from '@/lib/email-templates'

const bodySchema = z.object({
  template: z.enum(['scheduling', 'rejection', 'advance']),
  to: z.string().email(),
  candidateName: z.string().default('Test Candidate'),
  positionTitle: z.string().default('Senior Engineer'),
  client: z.string().default('Acme Corp'),
  roundLabel: z.string().default('Technical Round 1'),
  nextRoundLabel: z.string().default('Client Interview'),
  recruiterName: z.string().default('Test Recruiter'),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  let email: { subject: string; html: string }

  if (d.template === 'scheduling') {
    email = schedulingRequestEmail({
      candidateName: d.candidateName,
      positionTitle: d.positionTitle,
      client: d.client,
      roundLabel: d.roundLabel,
      recruiterName: d.recruiterName,
    })
  } else if (d.template === 'rejection') {
    email = rejectionEmail({
      candidateName: d.candidateName,
      positionTitle: d.positionTitle,
      client: d.client,
      recruiterName: d.recruiterName,
    })
  } else {
    email = advanceNotificationEmail({
      candidateName: d.candidateName,
      positionTitle: d.positionTitle,
      client: d.client,
      nextRoundLabel: d.nextRoundLabel,
      recruiterName: d.recruiterName,
    })
  }

  const result = await sendEmail({
    to: d.to,
    subject: email.subject,
    html: email.html,
    template: `test:${d.template}`,
    userId: (session.user as { id?: string }).id,
  })
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Send failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, subject: email.subject })
}
