import { Resend } from 'resend'
import { db } from '@/lib/db'

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

async function getFromAddress(): Promise<string> {
  const setting = await db.systemSettings.findUnique({ where: { key: 'SENDER_EMAIL' } })
  return setting?.value ?? 'noreply@example.com'
}

export async function sendEmail({
  to,
  subject,
  html,
  template,
  candidateId,
  candidatePositionId,
  interviewId,
  sentById,
}: {
  to: string
  subject: string
  html: string
  template: string
  candidateId?: string
  candidatePositionId?: string
  interviewId?: string
  sentById?: string
}): Promise<void> {
  const from = await getFromAddress()
  let status = 'sent'
  let errorMsg: string | undefined

  try {
    await getResend().emails.send({ from, to, subject, html })
  } catch (err) {
    status = 'failed'
    errorMsg = err instanceof Error ? err.message : String(err)
  }

  await db.emailLog.create({
    data: {
      to,
      subject,
      template,
      status,
      errorMsg,
      candidateId,
      candidatePositionId,
      interviewId,
      sentById,
    },
  })

  if (status === 'failed') {
    throw new Error(errorMsg)
  }
}
