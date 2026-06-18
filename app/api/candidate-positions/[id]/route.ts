import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const patchSchema = z.object({
  desiredCompensation: z.number().optional().nullable(),
  minimumCompensation: z.number().optional().nullable(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.candidatePosition.findFirst({
    where: { id },
    include: { position: { select: { internalCostBudget: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const minimumCompensation =
    parsed.data.minimumCompensation !== undefined
      ? parsed.data.minimumCompensation
      : existing.minimumCompensation
  const budget = existing.position.internalCostBudget
  const compensationOutOfRange =
    minimumCompensation != null && budget != null ? minimumCompensation > budget : false

  const cp = await db.candidatePosition.update({
    where: { id },
    data: { ...parsed.data, compensationOutOfRange },
  })

  return NextResponse.json(cp)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const cp = await db.candidatePosition.findFirst({ where: { id } })
  if (!cp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(cp)
}
