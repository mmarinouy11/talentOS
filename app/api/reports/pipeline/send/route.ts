'use server'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { z } from 'zod'

const schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { to, subject, html } = parsed.data

  try {
    await sendEmailViaSystemGmail({ to, subject, html })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send email'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
