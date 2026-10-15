import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeLinkedinHandle } from '@/lib/linkedin'
import { MISSING_IDENTIFIER_ERROR, findCandidateMatches, hasCandidateIdentifier, realEmailOrNull } from '@/lib/candidate-identity'

const candidateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().email().nullable().optional()),
  phone: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  linkedinUrl: z.string().refine((v) => !v || v.includes('linkedin.com') || v.startsWith('/in/'), { message: 'Invalid LinkedIn URL' }).optional().nullable(),
  seniority: z.enum(['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']).optional(),
  yearsOfExperience: z.number().transform(Math.round).optional().nullable(),
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
  cvDriveId: z.string().optional().nullable(),
  cvOriginalName: z.string().optional().nullable(),
  cvExperience: z.array(z.any()).optional().nullable(),
  cvEducation: z.array(z.any()).optional().nullable(),
  summary: z.string().optional().nullable(),
  desiredCompensation: z.number().optional().nullable(),
  minimumCompensation: z.number().optional().nullable(),
  sourcedByType: z.enum(['RECRUITER', 'VENDOR', 'OTHER']).optional().nullable(),
  sourcedByUserId: z.string().optional().nullable(),
  sourcedByVendorId: z.string().optional().nullable(),
  sourcedByOther: z.string().optional().nullable(),
  recruiterId: z.string().optional().nullable(),
  // duplicate-check context: the position being added to, and explicit confirmation for possible duplicates
  positionId: z.string().optional().nullable(),
  allowPossibleDuplicate: z.boolean().optional(),
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

  if (!hasCandidateIdentifier(parsed.data.email, parsed.data.linkedinUrl)) {
    return NextResponse.json({ error: MISSING_IDENTIFIER_ERROR }, { status: 400 })
  }
  const email = realEmailOrNull(parsed.data.email)

  const duplicate = await findCandidateMatches(parsed.data, { positionId: parsed.data.positionId })
  if (duplicate.kind === 'exact' || duplicate.kind === 'conflict' || (duplicate.kind === 'possible' && !parsed.data.allowPossibleDuplicate)) {
    const error = duplicate.kind === 'exact'
      ? 'This candidate already exists.'
      : duplicate.kind === 'conflict'
        ? 'This email belongs to one candidate and this LinkedIn to another. They may be duplicates — review before continuing.'
        : 'Similar candidates already exist.'
    return NextResponse.json({ error, duplicate }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { linkedinUrl, email: _e, positionId: _p, allowPossibleDuplicate: _a, ...rest } = parsed.data
  const sessionUser = session.user as { id?: string }
  const recruiterId = rest.recruiterId ?? sessionUser.id
  if (!recruiterId) return NextResponse.json({ error: 'recruiterId is required' }, { status: 400 })
  const { cvExperience, cvEducation, ...coreRest } = rest
  let candidate
  try {
   candidate = await db.candidate.create({
    data: {
      ...coreRest,
      email,
      linkedinUrl: linkedinUrl || null,
      linkedinHandle: normalizeLinkedinHandle(linkedinUrl),
      cvDriveId: coreRest.cvDriveId ?? null,
      cvOriginalName: coreRest.cvOriginalName ?? null,
      recruiterId,
      ...(Array.isArray(cvExperience) && cvExperience.length > 0 ? { cvExperience } : {}),
      ...(Array.isArray(cvEducation) && cvEducation.length > 0 ? { cvEducation } : {}),
    },
   })
  } catch (err: unknown) {
    // Unique email/LinkedIn held by a soft-deleted candidate (not visible to the duplicate check)
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'This email or LinkedIn profile belongs to a deleted candidate. Ask an admin to restore it.' }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json(candidate, { status: 201 })
}
