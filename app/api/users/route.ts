import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { userInvitationEmail } from '@/lib/email-templates'
import type { Role } from '@prisma/client'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return { deny: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return { deny: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null }
  }
  return { deny: null, session }
}

export async function GET() {
  const { deny } = await requireAdmin()
  if (deny) return deny

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, passwordHash: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(users.map((u) => ({
    ...u,
    pendingInvitation: u.passwordHash === null,
    passwordHash: undefined,
  })))
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'RECRUITER', 'INTERVIEWER', 'HIRING_MANAGER']),
})

export async function POST(request: Request) {
  const { deny } = await requireAdmin()
  if (deny) return deny

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, email, role } = parsed.data

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  // Check system Gmail is connected before creating user
  const systemAccount = await db.systemEmailAccount.findUnique({ where: { purpose: 'system_notifications' } })
  if (!systemAccount?.refreshToken) {
    return NextResponse.json(
      { error: 'Cannot send invitation — connect a system Gmail account in Settings first.' },
      { status: 503 }
    )
  }

  const invitationToken = randomBytes(32).toString('hex')
  const invitationExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  const user = await db.user.create({
    data: { name, email, role: role as Role, passwordHash: null, active: true, invitationToken, invitationExpiresAt },
    select: { id: true, name: true, email: true, role: true, active: true },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? ''
  const inviteLink = `${baseUrl}/invite/${invitationToken}`
  const { subject, html } = userInvitationEmail({ userName: name, inviteLink })

  sendEmailViaSystemGmail({ to: email, subject, html })
    .catch((err) => console.error('[create-user] Failed to send invitation email:', err))

  return NextResponse.json({ ...user, pendingInvitation: true }, { status: 201 })
}
