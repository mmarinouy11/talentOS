import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getMonthlyHoursBaseline, hourlyToMonthly } from '@/lib/dgm'
import { isCandidateInactive } from '@/lib/candidate-status'
import { locationAllowed } from '@/lib/location'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const vendor = await db.vendor.findUnique({
    where: { portalToken: token },
    include: {
      positionVendors: {
        include: {
          position: {
            select: {
              id: true,
              title: true,
              client: true,
              status: true,
              deletedAt: true,
              description: true,
              jdSummary: true,
              internalCostBudget: true,
              location: true,
            },
          },
        },
      },
    },
  })

  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const hoursBaseline = await getMonthlyHoursBaseline()

  const activePositions = vendor.positionVendors
    .map((pv) => pv.position)
    .filter((p) => !p.deletedAt)

  const positionIds = activePositions.map((p) => p.id)

  function semiAnonymizeName(firstName: string, lastName: string | null): string {
    const allParts = `${firstName} ${lastName ?? ''}`.trim().split(/\s+/)
    if (allParts.length === 1) return allParts[0]
    const first = allParts[0]
    const initials = allParts.slice(1).map((p) => p[0].toUpperCase() + '.').join(' ')
    return `${first} ${initials}`
  }

  // Fetch all candidates in pipeline for each position except this vendor's own submissions.
  // Use OR to correctly handle NULL sourcedByVendorId (Prisma NOT on nullable field excludes NULLs).
  const otherCPs = positionIds.length > 0
    ? await db.candidatePosition.findMany({
        where: {
          positionId: { in: positionIds },
          candidate: {
            deletedAt: null,
            OR: [
              { sourcedByVendorId: null },
              { sourcedByVendorId: { not: vendor.id } },
            ],
          },
        },
        select: {
          positionId: true,
          candidate: { select: { firstName: true, lastName: true, country: true } },
        },
      })
    : []

  // Build a lookup from positionId to position location for filtering
  const positionLocationMap = new Map(activePositions.map((p) => [p.id, p.location ?? []]))

  // Group by positionId, filtering by position location and excluding candidates with no country
  const otherByPosition = new Map<string, { firstNameInitial: string; country: string | null }[]>()
  for (const cp of otherCPs) {
    const country = cp.candidate.country
    if (!country) continue
    const posLocation = positionLocationMap.get(cp.positionId) ?? []
    if (!locationAllowed(posLocation, country)) continue
    const entry = {
      firstNameInitial: semiAnonymizeName(cp.candidate.firstName, cp.candidate.lastName),
      country,
    }
    const arr = otherByPosition.get(cp.positionId) ?? []
    arr.push(entry)
    otherByPosition.set(cp.positionId, arr)
  }

  const positions = activePositions.map((p) => ({
    id: p.id,
    title: p.title,
    client: p.client,
    status: p.status,
    jdRaw: p.description ?? null,
    jdSummary: p.jdSummary ?? null,
    location: p.location ?? [],
    budgetMonthly: p.internalCostBudget != null
      ? Math.round(hourlyToMonthly(p.internalCostBudget, hoursBaseline))
      : null,
    existingCandidates: otherByPosition.get(p.id) ?? [],
  }))

  const submissions = await db.candidatePosition.findMany({
    where: { candidate: { sourcedByVendorId: vendor.id, deletedAt: null } },
    include: {
      candidate: { select: { firstName: true, lastName: true, country: true } },
      position: { select: { title: true } },
      interviews: {
        where: { decisionNotes: { not: null } },
        orderBy: { decidedAt: 'desc' },
        take: 1,
        select: { decisionNotes: true, roundLabel: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const STAGE_LABELS: Record<string, string> = {
    APPLIED: 'Applied',
    SCREENING: 'Screening',
    TECHNICAL_INTERVIEW: 'Technical Interview',
    MANAGER_INTERVIEW: 'Manager Interview',
    CLIENT_INTERVIEW: 'Client Interview',
    OFFER: 'Offer',
    HIRED: 'Hired',
    REJECTED: 'Rejected',
    WITHDRAWN: 'On Hold',
  }

  return NextResponse.json({
    vendorId: vendor.id,
    vendorName: vendor.name,
    positions,
    submissions: submissions.map((cp) => ({
      id: cp.id,
      firstName: cp.candidate.firstName,
      lastName: cp.candidate.lastName,
      country: cp.candidate.country,
      positionTitle: cp.position.title,
      stage: STAGE_LABELS[cp.stage] ?? cp.stage,
      isActive: !isCandidateInactive(cp),
      decisionNotes: cp.interviews[0]?.decisionNotes ?? null,
      submittedAt: cp.createdAt.toISOString(),
    })),
  })
}
