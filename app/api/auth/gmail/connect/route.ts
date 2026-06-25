import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'

function getRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
  const uri = `${base}/api/auth/gmail/callback`
  console.log('[gmail/connect] redirect_uri =', uri, '| NEXTAUTH_URL =', process.env.NEXTAUTH_URL, '| AUTH_URL =', process.env.AUTH_URL)
  return uri
}

function getOAuthClient() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET
  const redirectUri = getRedirectUri()
  console.log(
    '[gmail/connect] OAuth2 constructor args —',
    'client_id length:', clientId?.length ?? 'UNDEFINED',
    '| client_secret length:', clientSecret?.length ?? 'UNDEFINED',
    '| redirect_uri:', redirectUri,
  )
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const redirectUri = getRedirectUri()
  if (!redirectUri.startsWith('http')) {
    console.error('[gmail/connect] NEXTAUTH_URL / AUTH_URL is not set — cannot build redirect_uri')
    return NextResponse.json({ error: 'Server misconfiguration: NEXTAUTH_URL is not set' }, { status: 500 })
  }

  const client = getOAuthClient()
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })

  console.log('[gmail/connect] generated OAuth URL:', url)
  return NextResponse.redirect(url)
}
