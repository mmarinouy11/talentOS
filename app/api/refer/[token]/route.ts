import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

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
              jdSummary: true,
              location: true,
            },
          },
        },
      },
    },
  })

  if (!vendor || !vendor.active || vendor.type !== 'REFERRAL_NETWORK') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const openPositions = vendor.positionVendors
    .map((pv) => pv.position)
    .filter((p) => !p.deletedAt && p.status === 'OPEN')
    .map((p) => ({
      id: p.id,
      title: p.title,
      client: p.client,
      jdSummary: p.jdSummary,
      location: p.location,
    }))

  return NextResponse.json({ vendorName: vendor.name, positions: openPositions })
}
