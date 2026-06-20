import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

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
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const candidates: CandidateInput[] = body.candidates ?? []

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json({ error: 'No candidates provided' }, { status: 400 })
    }

    if (candidates.length > 50) {
      return NextResponse.json({ error: 'Too many candidates (max 50)' }, { status: 400 })
    }

    let created = 0
    let skipped = 0
    const errors: string[] = []

    for (const c of candidates) {
      if (!c.email) { skipped++; continue }

      try {
        const exists = await db.candidate.findFirst({
          where: { email: c.email.toLowerCase(), deletedAt: null },
        })
        if (exists) { skipped++; continue }

        await db.candidate.create({
          data: {
            firstName: c.firstName ?? '',
            lastName: c.lastName ?? '',
            email: c.email.toLowerCase(),
            phone: c.phone ?? null,
            country: c.country ?? null,
            seniority: c.seniority ?? null,
            yearsOfExperience: c.yearsOfExperience ?? null,
            skills: c.skills ?? [],
            languages: c.languages ?? [],
            summary: c.summary ?? null,
          },
        })
        created++
      } catch (err) {
        console.error(`Failed to create candidate ${c.email}:`, err)
        errors.push(c.email)
      }
    }

    return NextResponse.json({ created, skipped, errors })
  } catch (err) {
    console.error('Bulk import confirm error:', err)
    return NextResponse.json({ error: 'Failed to create candidates' }, { status: 500 })
  }
}
