import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getMonthlyHoursBaseline, hourlyToMonthly } from '@/lib/dgm'

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

  const positions = vendor.positionVendors
    .map((pv) => pv.position)
    .filter((p) => !p.deletedAt)
    .map((p) => ({
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
    }))

  return NextResponse.json({
    vendorId: vendor.id,
    vendorName: vendor.name,
    positions,
  })
}
