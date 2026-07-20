import { db } from '@/lib/db'
import { google } from 'googleapis'

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

export class GmailTokenExpiredError extends Error {
  constructor() {
    super('Gmail connection expired — please reconnect at Profile → Gmail Connection.')
    this.name = 'GmailTokenExpiredError'
  }
}

function isInvalidGrant(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  if (e.code === 'invalid_grant') return true
  const msg = String(e.message ?? '')
  return msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')
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
  try {
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  } catch (err) {
    if (isInvalidGrant(err)) {
      await db.user.update({
        where: { id: userId },
        data: {
          gmailAccessToken: null,
          gmailRefreshToken: null,
          gmailTokenExpiry: null,
          gmailConnectedEmail: null,
        },
      })
      throw new GmailTokenExpiredError()
    }
    throw err
  }

  return from
}

async function getHeaderHtml(html: string): Promise<string> {
  const headerSetting = await db.systemSettings.findUnique({ where: { key: 'EMAIL_HEADER_IMAGE_URL' } })
  const headerImageUrl = headerSetting?.value || null
  return headerImageUrl
    ? `<img src="${headerImageUrl}" alt="" style="max-width:600px;width:100%;display:block;margin-bottom:16px;" />${html}`
    : html
}

export async function sendEmailViaSystemGmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const account = await db.systemEmailAccount.findUnique({ where: { purpose: 'system_notifications' } })
  if (!account?.refreshToken) {
    console.log('[system-gmail] No system Gmail connected, skipping notification')
    return
  }

  const finalHtml = await getHeaderHtml(html)

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_OAUTH_CLIENT_ID,
    process.env.GMAIL_OAUTH_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/system-gmail/callback`,
  )

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiry?.getTime(),
  })

  oauth2Client.on('tokens', async (tokens) => {
    await db.systemEmailAccount.update({
      where: { purpose: 'system_notifications' },
      data: {
        accessToken: tokens.access_token ?? undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    })
  })

  const from = account.connectedEmail ?? 'me'
  const raw = buildRawEmail({ from, to, subject, html: finalHtml })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
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
}): Promise<{ success: boolean; error?: string; gmailExpired?: boolean }> {
  if (!userId) {
    return { success: false, error: 'No sender specified — a Gmail account is required to send emails.' }
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { gmailRefreshToken: true } })
  if (!user?.gmailRefreshToken) {
    await db.emailLog.create({
      data: { to, subject, template, status: 'failed', errorMsg: 'Gmail not connected', candidateId, candidatePositionId, interviewId, sentById },
    })
    return {
      success: false,
      error: 'This recruiter has not connected a Gmail account. Connect Gmail in Profile settings to send emails.',
    }
  }

  const finalHtml = await getHeaderHtml(html)

  try {
    await sendEmailViaGmail(userId, { to, subject, html: finalHtml })
    await db.emailLog.create({
      data: { to, subject, template, status: 'sent', candidateId, candidatePositionId, interviewId, sentById },
    })
    return { success: true }
  } catch (err) {
    const isExpired = err instanceof GmailTokenExpiredError
    const errorMsg = isExpired
      ? 'Your Gmail connection has expired and needs to be reconnected. Please go to Profile → Gmail Connection and reconnect your account.'
      : (err instanceof Error ? err.message : String(err))
    await db.emailLog.create({
      data: { to, subject, template, status: 'failed', errorMsg, candidateId, candidatePositionId, interviewId, sentById },
    })
    return { success: false, error: errorMsg, gmailExpired: isExpired }
  }
}
