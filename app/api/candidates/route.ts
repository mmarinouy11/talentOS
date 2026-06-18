import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const candidateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  seniority: z.enum(['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']).optional(),
  yearsOfExperience: z.number().int().optional().nullable(),
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
  cvDriveId: z.string().optional().nullable(),
  cvOriginalName: z.string().optional().nullable(),
})

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim()

  const candidates = await db.candidate.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      country: true,
      cvDriveId: true,
      cvOriginalName: true,
      skills: true,
      languages: true,
      seniority: true,
      yearsOfExperience: true,
      currentCompensation: true,
      currentCurrency: true,
      currentEmploymentType: true,
      summary: true,
      strengths: true,
      risks: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      _count: {
        select: {
          candidatePositions: {
            where: { stage: { notIn: ['HIRED', 'REJECTED'] } },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(candidates)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = candidateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const existing = await db.candidate.findFirst({
    where: { email: parsed.data.email, deletedAt: null },
  })
  if (existing) {
    return NextResponse.json({ error: 'A candidate with this email already exists.' }, { status: 409 })
  }

  // Candidate model does not have linkedinUrl or notes fields — drop them
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { linkedinUrl: _li, notes: _n, ...rest } = parsed.data
  const candidate = await db.candidate.create({
    data: {
      ...rest,
      cvDriveId: rest.cvDriveId ?? null,
      cvOriginalName: rest.cvOriginalName ?? null,
    },
  })

  return NextResponse.json(candidate, { status: 201 })
}
