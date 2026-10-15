import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'
import { normalizeLinkedinHandle } from '@/lib/linkedin'
import { findCandidateMatches, hasCandidateIdentifier, realEmailOrNull } from '@/lib/candidate-identity'

interface CandidateInput {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  country: string | null
  linkedinUrl: string | null
  seniority: 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL' | null
  yearsOfExperience: number | null
  skills: string[]
  languages: string[]
  summary: string | null
  experience: { title: string; company: string; startDate: string; endDate: string; bullets: string[] }[]
  education: { degree: string; institution: string; year?: string }[]
  cvDriveId: string | null
  cvOriginalName: string | null
}

export interface ConfirmResult {
  created: number
  skipped: number
  // existing candidates linked to the position instead of being created
  linked: number
  // rows not written because their email and LinkedIn belong to different candidates
  conflicts: string[]
  errors: string[]
  candidatePositions?: Array<{
    id: string
    stage: 'APPLIED'
    fitScore: null
    createdAt: string
    candidate: {
      id: string
      firstName: string
      lastName: string
      email: string | null
      seniority: string | null
    }
  }>
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const candidates: CandidateInput[] = body.candidates ?? []
    const positionId: string | undefined = body.positionId

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json({ error: 'No candidates provided' }, { status: 400 })
    }

    if (candidates.length > 50) {
      return NextResponse.json({ error: 'Too many candidates (max 50)' }, { status: 400 })
    }

    const userId = (session.user as { id?: string }).id!

    let created = 0
    let skipped = 0
    let linked = 0
    const conflicts: string[] = []
    const errors: string[] = []
    const createdPositions: ConfirmResult['candidatePositions'] = []

    for (const c of candidates) {
      // Rows with neither a real email nor a LinkedIn profile URL are skipped
      if (!hasCandidateIdentifier(c.email, c.linkedinUrl)) { skipped++; continue }
      const email = realEmailOrNull(c.email)?.toLowerCase() ?? null
      const label = email ?? c.linkedinUrl ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()

      try {
        // Re-checked here because the recruiter may have edited the email or LinkedIn in the review table
        const match = await findCandidateMatches(
          { email, linkedinUrl: c.linkedinUrl, firstName: c.firstName, lastName: c.lastName, phone: c.phone, country: c.country },
          { positionId },
        )
        if (match.kind === 'conflict') { conflicts.push(label); continue }

        let candidate
        if (match.kind === 'exact') {
          // Existing candidate: link to the position instead of creating; nothing to do without a position
          if (!positionId) { skipped++; continue }
          candidate = await db.candidate.findUniqueOrThrow({ where: { id: match.candidates[0].id } })
        } else {
          // New or possible duplicate: the recruiter selected the row, so it is created
          candidate = await db.candidate.create({
            data: {
              firstName: c.firstName ?? '',
              lastName: c.lastName ?? '',
              email,
              linkedinUrl: c.linkedinUrl || null,
              linkedinHandle: normalizeLinkedinHandle(c.linkedinUrl),
              phone: c.phone ?? null,
              country: c.country ?? null,
              seniority: c.seniority ?? null,
              yearsOfExperience: c.yearsOfExperience != null ? Math.round(c.yearsOfExperience) : null,
              skills: c.skills ?? [],
              languages: c.languages ?? [],
              summary: c.summary ?? null,
              cvDriveId: c.cvDriveId ?? null,
              cvOriginalName: c.cvOriginalName ?? null,
              sourcedByType: 'RECRUITER',
              recruiterId: userId,
              ...(Array.isArray(c.experience) && c.experience.length > 0 ? { cvExperience: c.experience } : {}),
              ...(Array.isArray(c.education) && c.education.length > 0 ? { cvEducation: c.education } : {}),
            },
          })
          created++
        }

        if (positionId) {
          const existing = await db.candidatePosition.findFirst({
            where: { candidateId: candidate.id, positionId },
          })
          if (existing) {
            if (match.kind === 'exact') skipped++
          } else {
            if (match.kind === 'exact') linked++
            const cp = await db.candidatePosition.create({
              data: {
                candidateId: candidate.id,
                positionId,
                stage: 'APPLIED',
                stageEnteredAt: new Date(),
                recruiterId: userId,
              },
            })
            await db.stageHistory.create({
              data: {
                candidatePositionId: cp.id,
                fromStage: null,
                toStage: 'APPLIED',
                movedById: userId,
              },
            })
            // fire-and-forget scoring
            scoreCandidateForPosition(cp.id).catch(console.error)

            createdPositions!.push({
              id: cp.id,
              stage: 'APPLIED',
              fitScore: null,
              createdAt: cp.createdAt.toISOString(),
              candidate: {
                id: candidate.id,
                firstName: candidate.firstName,
                lastName: candidate.lastName,
                email: candidate.email,
                seniority: candidate.seniority,
              },
            })
          }
        }
      } catch (err) {
        console.error(`Failed to process candidate ${label}:`, err)
        errors.push(label)
      }
    }

    const result: ConfirmResult = { created, skipped, linked, conflicts, errors }
    if (positionId) result.candidatePositions = createdPositions

    return NextResponse.json(result)
  } catch (err) {
    console.error('Bulk import confirm error:', err)
    return NextResponse.json({ error: 'Failed to create candidates' }, { status: 500 })
  }
}
