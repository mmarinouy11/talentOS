import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// Public endpoint — no auth required — returns brand settings for public-facing pages
export async function GET() {
  const setting = await db.systemSettings.findUnique({ where: { key: 'EMAIL_HEADER_IMAGE_URL' } })
  return NextResponse.json({ headerImageUrl: setting?.value || null })
}
