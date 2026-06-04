import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const positionSchema = z.object({
  title: z.string().min(1),
  client: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  target_date_asap: z.boolean().default(false),
  target_date: z.string().datetime().optional().nullable(),
  location: z.array(z.string()).min(1, 'Select at least one location'),
  recruiterId: z.string().optional(),
  hiring_manager_email: z.string().email().optional().nullable(),
  hiring_manager_name: z.string().optional().nullable(),
  sales_contact_email: z.string().email().optional().nullable(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const positions = await db.position.findMany({
    where: { deletedAt: null },
    include: {
      recruiter: { select: { id: true, name: true, email: true } },
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

  const userId = (session.user as { id?: string }).id!
  const position = await db.position.create({
    data: {
      ...parsed.data,
      status: 'OPEN',
      recruiterId: parsed.data.recruiterId || userId,
    },
  })

  return NextResponse.json(position, { status: 201 })
}
