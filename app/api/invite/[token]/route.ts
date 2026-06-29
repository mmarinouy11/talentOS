import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const user = await db.user.findUnique({
    where: { invitationToken: token },
    select: { name: true, invitationUsedAt: true, invitationExpiresAt: true },
  })

  if (!user) {
    return NextResponse.json({ state: 'invalid', error: 'This invitation link is invalid or has expired.' }, { status: 404 })
  }
  if (user.invitationUsedAt) {
    return NextResponse.json({ state: 'used', error: 'This invitation has already been used. Please log in with your existing password.' }, { status: 409 })
  }
  if (user.invitationExpiresAt && user.invitationExpiresAt < new Date()) {
    return NextResponse.json({ state: 'expired', error: 'This invitation link has expired. Please contact your administrator for a new one.' }, { status: 410 })
  }

  return NextResponse.json({ state: 'ready', userName: user.name ?? '' })
}
