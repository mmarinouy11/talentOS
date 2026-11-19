import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { locationAllowed } from '@/lib/location'
import { prefilterCandidate } from '@/lib/talent-prefilter'
import { getFindCandidatesSettings } from '@/lib/find-candidates-settings'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: positionId } = await params

  const position = await db.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { id: true, title: true, jdSkills: true, coreSkills: true, location: true, jdSeniority: true },
  })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

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
      // Redeployment people are included even when their CV gave no skills (roster skills are used instead);
      // the title match can still make others relevant
      OR: [{ skills: { isEmpty: false } }, { redeploymentProfile: { status: 'ACTIVE' } }],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      country: true,
      skills: true,
      seniority: true,
      yearsOfExperience: true,
      cvExperience: true,
      redeploymentProfile: { select: { status: true, excludedFromMatching: true, lwd: true, primarySkill: true, subSkill: true, lastJobTitle: true } },
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
    // ACTIVE redeployment profile only: highlighted, never prioritized
    redeploy: { lwd: string | null } | null
    // Prefilter (no AI): who gets real-scored first. rank stays server-side; autoScore is only "may be auto-scored"
    autoScore: boolean
    rank: number
  }

  const coreSkills = position.coreSkills ?? []
  const otherSkills = (position.jdSkills ?? []).filter((s) => !coreSkills.includes(s))
  const matches: Match[] = []
  for (const c of candidates) {
    // Location filter
    if (hasLocationFilter && c.country) {
      if (!locationAllowed(position.location, c.country)) continue
    } else if (hasLocationFilter && !c.country) {
      continue
    }

    const rp = c.redeploymentProfile?.status === 'ACTIVE' && !c.redeploymentProfile.excludedFromMatching ? c.redeploymentProfile : null
    const latestRole = [
      Array.isArray(c.cvExperience) ? (c.cvExperience[0] as { title?: unknown } | undefined)?.title : null,
      rp?.lastJobTitle,
    ].filter((t): t is string => typeof t === 'string').join(' ')
    const pf = prefilterCandidate({
      positionTitle: position.title,
      coreSkills,
      otherSkills,
      positionSeniority: position.jdSeniority,
      candidateSkills: [...c.skills, ...(rp ? [rp.primarySkill, rp.subSkill].filter((s): s is string => !!s) : [])],
      candidateLatestRole: latestRole || null,
      candidateSeniority: c.seniority,
    })
    if (!pf.relevant) continue

    matches.push({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      country: c.country,
      skills: c.skills,
      seniority: c.seniority,
      yearsOfExperience: c.yearsOfExperience,
      matchingSkills: pf.matchingSkills,
      redeploy: rp ? { lwd: rp.lwd?.toISOString() ?? null } : null,
      autoScore: pf.eligible,
      rank: pf.rank,
    })
  }

  // Eligible first, then by prefilter rank. Redeploy people get no bonus here.
  matches.sort((a, b) => Number(b.autoScore) - Number(a.autoScore) || b.rank - a.rank)
  const settings = await getFindCandidatesSettings()

  return NextResponse.json({
    // Ordered by the prefilter; its numbers stay server-side
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    candidates: matches.slice(0, 50).map(({ rank: _r, ...rest }) => rest),
    autoScoring: settings,
    total: matches.length,
    position: {
      jdSkills: position.jdSkills,
      coreSkills: position.coreSkills,
      jdSeniority: position.jdSeniority,
    },
  })
}
