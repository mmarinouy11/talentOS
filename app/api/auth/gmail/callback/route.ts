import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function getRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
  return `${base}/api/auth/gmail/callback`
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_OAUTH_CLIENT_ID,
    process.env.GMAIL_OAUTH_CLIENT_SECRET,
    getRedirectUri(),
  )
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/login`)

  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/profile?gmail=error`)

  const code = req.nextUrl.searchParams.get('code')
  console.log('[gmail/callback] received code:', !!code, 'starting token exchange')
  if (!code) return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/profile?gmail=error`)

  try {
    const client = getOAuthClient()
    const { tokens } = await client.getToken(code)
    console.log('[gmail/callback] token exchange success, has refresh_token:', !!tokens.refresh_token)

    // Fetch the Gmail address for the connected account
    client.setCredentials(tokens)
    const gmail = google.oauth2({ version: 'v2', auth: client })
    const userInfo = await gmail.userinfo.get()
    const gmailEmail = userInfo.data.email ?? null
    console.log('[gmail/callback] userinfo fetched, email present:', !!gmailEmail)

    await db.user.update({
      where: { id: userId },
      data: {
        gmailAccessToken: tokens.access_token ?? null,
        gmailRefreshToken: tokens.refresh_token ?? null,
        gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        gmailConnectedEmail: gmailEmail,
      },
    })

    console.log('[gmail/callback] DB updated, redirecting to /profile?gmail=connected')
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/profile?gmail=connected`)
  } catch (error) {
    console.error('[gmail/callback] ERROR:', error)
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/profile?gmail=error`)
  }
}
