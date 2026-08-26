import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'

interface CandidateInput {
  firstName: string | null
  lastName: string | null
  email: string
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
      email: string
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
    const errors: string[] = []
    const createdPositions: ConfirmResult['candidatePositions'] = []

    for (const c of candidates) {
      if (!c.email) { skipped++; continue }

      try {
        let candidate = await db.candidate.findFirst({
          where: { email: c.email.toLowerCase(), deletedAt: null },
        })

        if (!candidate) {
          candidate = await db.candidate.create({
            data: {
              firstName: c.firstName ?? '',
              lastName: c.lastName ?? '',
              email: c.email.toLowerCase(),
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
        } else {
          skipped++
        }

        if (positionId) {
          const existing = await db.candidatePosition.findFirst({
            where: { candidateId: candidate.id, positionId },
          })
          if (!existing) {
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
        console.error(`Failed to process candidate ${c.email}:`, err)
        errors.push(c.email)
      }
    }

    const result: ConfirmResult = { created, skipped, errors }
    if (positionId) result.candidatePositions = createdPositions

    return NextResponse.json(result)
  } catch (err) {
    console.error('Bulk import confirm error:', err)
    return NextResponse.json({ error: 'Failed to create candidates' }, { status: 500 })
  }
}
