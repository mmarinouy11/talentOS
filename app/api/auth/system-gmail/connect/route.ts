import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'

function getRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
  return `${base}/api/auth/system-gmail/callback`
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as { role?: string }
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const redirectUri = getRedirectUri()
  if (!redirectUri.startsWith('http')) {
    return NextResponse.json({ error: 'Server misconfiguration: NEXTAUTH_URL is not set' }, { status: 500 })
  }

  const client = new google.auth.OAuth2(
    process.env.GMAIL_OAUTH_CLIENT_ID,
    process.env.GMAIL_OAUTH_CLIENT_SECRET,
    redirectUri,
  )

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })

  return NextResponse.redirect(url)
}
