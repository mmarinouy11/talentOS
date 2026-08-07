import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { locationAllowed } from '@/lib/location'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: positionId } = await params

  const position = await db.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { id: true, jdSkills: true, coreSkills: true, location: true, jdSeniority: true },
  })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  const jdSkillsLower = position.jdSkills.map((s) => s.toLowerCase())
  const hasLocationFilter = position.location && position.location.length > 0

  // IDs already in this position
  const inPosition = await db.candidatePosition.findMany({
    where: { positionId },
    select: { candidateId: true },
  })
  const inPositionIds = new Set(inPosition.map((cp) => cp.candidateId))

  // IDs active in any position
  const activeElsewhere = await db.candidatePosition.findMany({
    where: { status: { in: ['ACTIVE'] }, stage: { in: ['SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER', 'HIRED'] } },
    select: { candidateId: true },
  })
  const activeIds = new Set(activeElsewhere.map((cp) => cp.candidateId))

  const excluded = new Set([...inPositionIds, ...activeIds])

  // Fetch candidates with skills (wide net, filter in JS for skills overlap)
  const candidates = await db.candidate.findMany({
    where: {
      deletedAt: null,
      id: { notIn: [...excluded] },
      skills: { isEmpty: false },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      country: true,
      skills: true,
      seniority: true,
      yearsOfExperience: true,
    },
  })

  type Match = {
    id: string
    firstName: string
    lastName: string
    country: string | null
    skills: string[]
    seniority: string | null
    yearsOfExperience: number | null
    matchingSkills: string[]
    matchCount: number
  }

  const matches: Match[] = []
  for (const c of candidates) {
    // Location filter
    if (hasLocationFilter && c.country) {
      if (!locationAllowed(position.location, c.country)) continue
    } else if (hasLocationFilter && !c.country) {
      continue
    }

    // Skills overlap
    const candidateSkillsLower = c.skills.map((s) => s.toLowerCase())
    const matchingSkills: string[] = []
    for (const jdSkill of jdSkillsLower) {
      if (candidateSkillsLower.some((cs) => cs.includes(jdSkill) || jdSkill.includes(cs))) {
        const original = position.jdSkills[jdSkillsLower.indexOf(jdSkill)]
        matchingSkills.push(original)
      }
    }
    if (matchingSkills.length === 0) continue

    matches.push({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      country: c.country,
      skills: c.skills,
      seniority: c.seniority,
      yearsOfExperience: c.yearsOfExperience,
      matchingSkills,
      matchCount: matchingSkills.length,
    })
  }

  matches.sort((a, b) => b.matchCount - a.matchCount)

  return NextResponse.json({
    candidates: matches.slice(0, 50),
    total: matches.length,
    position: {
      jdSkills: position.jdSkills,
      coreSkills: position.coreSkills,
      jdSeniority: position.jdSeniority,
    },
  })
}
