import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    gmail_client_id_exists: !!process.env.GMAIL_OAUTH_CLIENT_ID,
    gmail_client_id_length: process.env.GMAIL_OAUTH_CLIENT_ID?.length ?? 0,
    gmail_client_id_first6: process.env.GMAIL_OAUTH_CLIENT_ID?.slice(0, 6) ?? null,
    gmail_secret_exists: !!process.env.GMAIL_OAUTH_CLIENT_SECRET,
    gmail_secret_length: process.env.GMAIL_OAUTH_CLIENT_SECRET?.length ?? 0,
    nextauth_url: process.env.NEXTAUTH_URL ?? null,
    all_env_keys_containing_gmail: Object.keys(process.env).filter(k => k.toLowerCase().includes('gmail')),
  })
}
