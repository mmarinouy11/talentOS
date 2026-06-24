import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id?: string }).id
  if (!userId) return NextResponse.json({ error: 'No user id' }, { status: 400 })

  await db.user.update({
    where: { id: userId },
    data: {
      gmailAccessToken: null,
      gmailRefreshToken: null,
      gmailTokenExpiry: null,
      gmailConnectedEmail: null,
    },
  })

  return NextResponse.json({ ok: true })
}
