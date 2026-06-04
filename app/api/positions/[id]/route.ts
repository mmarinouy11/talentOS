import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(['OPEN', 'ON_HOLD', 'CLOSED', 'FILLED']).optional(),
  sla_days: z.number().int().positive().optional(),
  budget_min: z.number().optional().nullable(),
  budget_max: z.number().optional().nullable(),
  currency: z.string().optional(),
  recruiterId: z.string().optional(),
  hiringManagerId: z.string().optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const position = await db.position.findFirst({
    where: { id, deletedAt: null },
    include: {
      recruiter: { select: { id: true, name: true, email: true } },
      hiringManager: { select: { id: true, name: true, email: true } },
      candidatePositions: {
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              seniority: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { candidatePositions: true } },
    },
  })

  if (!position) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(position)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.position.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const position = await db.position.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json(position)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.position.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.position.update({ where: { id }, data: { deletedAt: new Date() } })

  return NextResponse.json({ ok: true })
}
