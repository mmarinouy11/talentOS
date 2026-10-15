import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeLinkedinHandle } from '@/lib/linkedin'
import { MISSING_IDENTIFIER_ERROR, hasCandidateIdentifier, realEmailOrNull } from '@/lib/candidate-identity'

const patchSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().email().nullable().optional()),
  phone: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  linkedinUrl: z.string().refine((v) => !v || v.includes('linkedin.com') || v.startsWith('/in/'), { message: 'Invalid LinkedIn URL' }).optional().nullable(),
  seniority: z.enum(['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']).optional(),
  yearsOfExperience: z.number().transform(Math.round).optional().nullable(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  cvDriveId: z.string().optional().nullable(),
  cvOriginalName: z.string().optional().nullable(),
  desiredCompensation: z.number().optional().nullable(),
  minimumCompensation: z.number().optional().nullable(),
  sourcedByType: z.enum(['RECRUITER', 'VENDOR', 'OTHER']).optional().nullable(),
  sourcedByUserId: z.string().optional().nullable(),
  sourcedByVendorId: z.string().optional().nullable(),
  sourcedByOther: z.string().optional().nullable(),
  recruiterId: z.string().optional(),
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { linkedinUrl, notes: _n, email, ...rest } = parsed.data

  const identity: { email?: string | null; linkedinUrl?: string | null; linkedinHandle?: string | null } = {}
  if (email !== undefined) identity.email = realEmailOrNull(email)
  if (linkedinUrl !== undefined) {
    identity.linkedinUrl = linkedinUrl || null
    identity.linkedinHandle = normalizeLinkedinHandle(linkedinUrl)
  }
  const nextEmail = identity.email !== undefined ? identity.email : existing.email
  const nextLinkedin = identity.linkedinUrl !== undefined ? identity.linkedinUrl : existing.linkedinUrl
  // Legacy records without any identifier stay editable; an edit just can't remove the last one
  if (hasCandidateIdentifier(existing.email, existing.linkedinUrl) && !hasCandidateIdentifier(nextEmail, nextLinkedin)) {
    return NextResponse.json({ error: MISSING_IDENTIFIER_ERROR }, { status: 400 })
  }

  try {
    const candidate = await db.candidate.update({ where: { id }, data: { ...rest, ...identity } })
    return NextResponse.json(candidate)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === 'P2002') {
      return NextResponse.json({ error: 'A candidate with this email address already exists.' }, { status: 409 })
    }
    console.error('[PATCH /api/candidates/[id]]', err)
    return NextResponse.json({ error: 'Failed to update candidate.' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.candidate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

  try {
    await db.$transaction([
      db.emailLog.deleteMany({
        where: { interview: { candidatePosition: { candidateId: id } } },
      }),
      db.emailLog.deleteMany({
        where: { candidatePosition: { candidateId: id } },
      }),
      db.emailLog.deleteMany({
        where: { candidateId: id },
      }),
      db.interview.deleteMany({
        where: { candidatePosition: { candidateId: id } },
      }),
      db.stageHistory.deleteMany({
        where: { candidatePosition: { candidateId: id } },
      }),
      db.candidatePosition.deleteMany({
        where: { candidateId: id },
      }),
      db.candidate.delete({ where: { id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[delete-candidate] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    )
  }
}
