import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { userInvitationEmail } from '@/lib/email-templates'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, passwordHash: true } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (user.passwordHash !== null) {
    return NextResponse.json({ error: 'User has already accepted their invitation.' }, { status: 400 })
  }

  const systemAccount = await db.systemEmailAccount.findUnique({ where: { purpose: 'system_notifications' } })
  if (!systemAccount?.refreshToken) {
    return NextResponse.json(
      { error: 'Cannot send invitation — connect a system Gmail account in Settings first.' },
      { status: 503 }
    )
  }

  const invitationToken = randomBytes(32).toString('hex')
  const invitationExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  await db.user.update({
    where: { id },
    data: { invitationToken, invitationExpiresAt, invitationUsedAt: null },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
  const inviteLink = `${baseUrl}/invite/${invitationToken}`
  const { subject, html } = userInvitationEmail({ userName: user.name ?? user.email, inviteLink })

  sendEmailViaSystemGmail({ to: user.email, subject, html })
    .catch((err) => console.error('[resend-invitation] Failed to send:', err))

  return NextResponse.json({ ok: true })
}
