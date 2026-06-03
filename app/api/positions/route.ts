import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const createPositionSchema = z.object({
  title: z.string().min(1),
  department: z.string().min(1),
  description: z.string().min(1),
  sla_days: z.number().int().positive(),
  budget_min: z.number().optional(),
  budget_max: z.number().optional(),
  currency: z.string().default('USD'),
  recruiterId: z.string(),
  hiringManagerId: z.string(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const positions = await db.position.findMany({
    where: { deletedAt: null },
    include: {
      recruiter: { select: { id: true, name: true, email: true } },
      hiringManager: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(positions)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = createPositionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const position = await db.position.create({ data: parsed.data })
  return NextResponse.json(position, { status: 201 })
}
