import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const SELECT = {
  id: true,
  name: true,
  email: true,
  calendarLink: true,
  timezone: true,
  role: true,
  schedulingEmailTemplate: true,
  rejectionEmailTemplate: true,
  advanceEmailTemplate: true,
  gmailConnectedEmail: true,
} as const

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: (session.user as { id?: string }).id! },
    select: SELECT,
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  calendarLink: z.string().url().nullable().optional().or(z.literal('')),
  timezone: z.string().nullable().optional(),
  schedulingEmailTemplate: z.string().nullable().optional(),
  rejectionEmailTemplate: z.string().nullable().optional(),
  advanceEmailTemplate: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  const user = await db.user.update({
    where: { id: (session.user as { id?: string }).id! },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.calendarLink !== undefined ? { calendarLink: d.calendarLink || null } : {}),
      ...(d.timezone !== undefined ? { timezone: d.timezone || null } : {}),
      ...(d.schedulingEmailTemplate !== undefined ? { schedulingEmailTemplate: d.schedulingEmailTemplate || null } : {}),
      ...(d.rejectionEmailTemplate !== undefined ? { rejectionEmailTemplate: d.rejectionEmailTemplate || null } : {}),
      ...(d.advanceEmailTemplate !== undefined ? { advanceEmailTemplate: d.advanceEmailTemplate || null } : {}),
    },
    select: SELECT,
  })

  return NextResponse.json(user)
}
