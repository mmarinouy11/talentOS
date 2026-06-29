import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const bodySchema = z.object({
  password: z.string().min(8),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const user = await db.user.findUnique({ where: { invitationToken: token } })

  if (!user) {
    return NextResponse.json({ error: 'This invitation link is invalid or has expired.' }, { status: 404 })
  }
  if (user.invitationUsedAt) {
    return NextResponse.json({ error: 'This invitation has already been used. Please log in with your existing password.' }, { status: 409 })
  }
  if (user.invitationExpiresAt && user.invitationExpiresAt < new Date()) {
    return NextResponse.json({ error: 'This invitation link has expired. Please contact your administrator for a new one.' }, { status: 410 })
  }

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, invitationUsedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
