import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: (session.user as { id?: string }).id! },
    select: { id: true, name: true, email: true, calendarLink: true, role: true },
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  calendarLink: z.string().url().nullable().optional().or(z.literal('')),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const user = await db.user.update({
    where: { id: (session.user as { id?: string }).id! },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.calendarLink !== undefined ? { calendarLink: parsed.data.calendarLink || null } : {}),
    },
    select: { id: true, name: true, email: true, calendarLink: true, role: true },
  })

  return NextResponse.json(user)
}
