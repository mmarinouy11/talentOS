import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { locationAllowed } from '@/lib/location'

function semiAnonymizeName(firstName: string, lastName: string | null): string {
  const allParts = `${firstName} ${lastName ?? ''}`.trim().split(/\s+/)
  if (allParts.length === 1) return allParts[0]
  const first = allParts[0]
  const initials = allParts.slice(1).map((p) => p[0].toUpperCase() + '.').join(' ')
  return `${first} ${initials}`
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const vendor = await db.vendor.findUnique({
    where: { referralToken: token },
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
              location: true,
              timezone: true,
            },
          },
        },
      },
    },
  })

  if (!vendor || !vendor.active || vendor.type !== 'REFERRAL_NETWORK') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const activePositions = vendor.positionVendors
    .map((pv) => pv.position)
    .filter((p) => !p.deletedAt)

  const positionIds = activePositions.map((p) => p.id)

  // Fetch existing candidates in pipeline (semi-anonymized), excluding this vendor's own submissions
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

  const positionLocationMap = new Map(activePositions.map((p) => [p.id, p.location ?? []]))

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
    budgetMonthly: null, // not shown in referral portal
    timezone: p.timezone ?? 'America/Montevideo',
    existingCandidates: otherByPosition.get(p.id) ?? [],
  }))

  return NextResponse.json({ vendorName: vendor.name, positions })
}
