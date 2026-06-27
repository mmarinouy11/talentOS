import { Resend } from 'resend'
import { db } from '@/lib/db'
import { google } from 'googleapis'

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

function encodeSubject(subject: string): string {
  if (/[^\x00-\x7F]/.test(subject)) {
    return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  }
  return subject
}

function buildRawEmail({ from, to, subject, html }: { from: string; to: string; subject: string; html: string }): string {
  const encodedBody = Buffer.from(html, 'utf-8').toString('base64')
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
  ].join('\r\n')
  return Buffer.from(raw).toString('base64url')
}

export async function sendEmailViaGmail(
  userId: string,
  { to, subject, html }: { to: string; subject: string; html: string },
): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { gmailAccessToken: true, gmailRefreshToken: true, gmailTokenExpiry: true, gmailConnectedEmail: true },
  })

  if (!user?.gmailRefreshToken) throw new Error('Gmail not connected for this user')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_OAUTH_CLIENT_ID,
    process.env.GMAIL_OAUTH_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/gmail/callback`,
  )

  oauth2Client.setCredentials({
    access_token: user.gmailAccessToken,
    refresh_token: user.gmailRefreshToken,
    expiry_date: user.gmailTokenExpiry?.getTime(),
  })

  // Auto-refresh token if needed and persist the new tokens
  oauth2Client.on('tokens', async (tokens) => {
    await db.user.update({
      where: { id: userId },
      data: {
        gmailAccessToken: tokens.access_token ?? undefined,
        gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    })
  })

  const from = user.gmailConnectedEmail ?? 'me'
  const raw = buildRawEmail({ from, to, subject, html })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

  return from
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
  userId,
}: {
  to: string
  subject: string
  html: string
  template: string
  candidateId?: string
  candidatePositionId?: string
  interviewId?: string
  sentById?: string
  userId?: string
}): Promise<void> {
  let status = 'sent'
  let errorMsg: string | undefined
  let from: string

  // Prepend header image if configured
  const headerSetting = await db.systemSettings.findUnique({ where: { key: 'EMAIL_HEADER_IMAGE_URL' } })
  const headerImageUrl = headerSetting?.value || null
  const finalHtml = headerImageUrl
    ? `<img src="${headerImageUrl}" alt="" style="max-width:600px;width:100%;display:block;margin-bottom:16px;" />${html}`
    : html

  const useGmail = !!userId && !!(await db.user.findUnique({
    where: { id: userId },
    select: { gmailRefreshToken: true },
  }))?.gmailRefreshToken

  try {
    if (useGmail && userId) {
      from = await sendEmailViaGmail(userId, { to, subject, html: finalHtml })
    } else {
      from = await getFromAddress()
      await getResend().emails.send({ from, to, subject, html: finalHtml })
    }
  } catch (err) {
    status = 'failed'
    errorMsg = err instanceof Error ? err.message : String(err)
    from = ''
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
