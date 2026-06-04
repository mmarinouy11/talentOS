import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const positionSchema = z.object({
  title: z.string().min(1),
  department: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(['OPEN', 'ON_HOLD', 'CLOSED', 'FILLED']).default('OPEN'),
  sla_days: z.number().int().positive().default(30),
  budget_min: z.number().optional().nullable(),
  budget_max: z.number().optional().nullable(),
  currency: z.string().default('USD'),
  recruiterId: z.string().optional(),
  hiringManagerId: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const positions = await db.position.findMany({
    where: { deletedAt: null },
    include: {
      recruiter: { select: { id: true, name: true, email: true } },
      hiringManager: { select: { id: true, name: true, email: true } },
      _count: { select: { candidatePositions: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(positions)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = positionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { recruiterId, hiringManagerId, ...rest } = parsed.data

  const userId = (session.user as { id?: string }).id!
  const position = await db.position.create({
    data: {
      ...rest,
      recruiterId: recruiterId || userId,
      hiringManagerId: hiringManagerId || userId,
    },
  })

  return NextResponse.json(position, { status: 201 })
}
