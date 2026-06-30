import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

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
            select: { id: true, title: true, client: true, status: true, deletedAt: true },
          },
        },
      },
    },
  })

  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const positions = vendor.positionVendors
    .map((pv) => pv.position)
    .filter((p) => !p.deletedAt)

  return NextResponse.json({
    vendorId: vendor.id,
    vendorName: vendor.name,
    positions,
  })
}
