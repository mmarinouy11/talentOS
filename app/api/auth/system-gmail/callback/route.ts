import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
  return `${base}/api/auth/system-gmail/callback`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const base = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''

  if (!session?.user) return NextResponse.redirect(`${base}/login`)

  const user = session.user as { role?: string }
  if (user.role !== 'ADMIN') return NextResponse.redirect(`${base}/settings?systemGmail=error`)

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(`${base}/settings?systemGmail=error`)

  try {
    const client = new google.auth.OAuth2(
      process.env.GMAIL_OAUTH_CLIENT_ID,
      process.env.GMAIL_OAUTH_CLIENT_SECRET,
      getRedirectUri(),
    )

    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const userInfo = await oauth2.userinfo.get()
    const connectedEmail = userInfo.data.email ?? null

    await db.systemEmailAccount.upsert({
      where: { purpose: 'system_notifications' },
      create: {
        purpose: 'system_notifications',
        connectedEmail,
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      update: {
        connectedEmail,
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    })

    return NextResponse.redirect(`${base}/settings?systemGmail=connected`)
  } catch (error) {
    console.error('[system-gmail/callback] ERROR:', error)
    return NextResponse.redirect(`${base}/settings?systemGmail=error`)
  }
}
