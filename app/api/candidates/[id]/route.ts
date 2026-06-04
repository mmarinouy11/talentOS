import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const patchSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  seniority: z.enum(['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']).optional(),
  yearsOfExperience: z.number().int().optional().nullable(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const candidate = await db.candidate.findFirst({
    where: { id, deletedAt: null },
    include: {
      candidatePositions: {
        include: {
          position: { select: { title: true, client: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!candidate) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(candidate)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.candidate.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Drop fields not in Candidate model
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { linkedinUrl: _li, notes: _n, ...rest } = parsed.data
  const candidate = await db.candidate.update({ where: { id }, data: rest })

  return NextResponse.json(candidate)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.candidate.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.candidate.update({ where: { id }, data: { deletedAt: new Date() } })

  return NextResponse.json({ ok: true })
}
