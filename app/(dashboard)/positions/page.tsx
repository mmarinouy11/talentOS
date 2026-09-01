import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PositionsDashboard } from '@/components/app/PositionsDashboard'
import type { PositionStatus, Role } from '@prisma/client'

export default async function PositionsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const isAdmin = (session.user as { role?: Role }).role === 'ADMIN'

  const positions = await db.position.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      client: true,
      status: true,
      priority: true,
      target_date_asap: true,
      target_date: true,
      createdAt: true,
      dgm: true,
      dgmAtRisk: true,
      headcount: true,
      recruiter: { select: { id: true, name: true, email: true } },
      _count: { select: { candidatePositions: true, positionVendors: true } },
      candidatePositions: { select: { status: true, startDate: true } },
    },
    orderBy: [{ client: 'asc' }, { createdAt: 'desc' }],
  })

  const counts: Record<PositionStatus, number> = { OPEN: 0, ON_HOLD: 0, CANCELLED: 0, FILLED: 0, CLOSED: 0 }
  const headcounts: Record<PositionStatus, number> = { OPEN: 0, ON_HOLD: 0, CANCELLED: 0, FILLED: 0, CLOSED: 0 }
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  let ytjPositionCount = 0
  let ytjHeadcount = 0
  for (const p of positions) {
    counts[p.status]++
    headcounts[p.status] += p.headcount ?? 1
    const hasYtj = p.candidatePositions.some(
      (cp) => cp.status === 'HIRED' && cp.startDate != null && cp.startDate > today
    )
    if (hasYtj) {
      ytjPositionCount++
      ytjHeadcount += p.headcount ?? 1
    }
  }

  const serialized = positions.map((p) => ({
    id: p.id,
    title: p.title,
    client: p.client,
    status: p.status,
    priority: p.priority,
    target_date_asap: p.target_date_asap,
    target_date: p.target_date?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    dgm: p.dgm,
    dgmAtRisk: p.dgmAtRisk,
    headcount: p.headcount,
    recruiter: p.recruiter,
    _count: p._count,
    isYtj: p.candidatePositions.some(
      (cp) => cp.status === 'HIRED' && cp.startDate != null && cp.startDate > today
    ),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Positions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{headcounts.OPEN} open headcount</p>
        </div>
        <Link href="/positions/new">
          <Button>New Position</Button>
        </Link>
      </div>

      <PositionsDashboard
        positions={serialized}
        isAdmin={isAdmin}
        counts={{ OPEN: counts.OPEN, ON_HOLD: counts.ON_HOLD, FILLED: counts.FILLED, CLOSED: counts.CLOSED, CANCELLED: counts.CANCELLED, ytjCount: ytjPositionCount }}
        headcounts={{ OPEN: headcounts.OPEN, ON_HOLD: headcounts.ON_HOLD, FILLED: headcounts.FILLED, CLOSED: headcounts.CLOSED, CANCELLED: headcounts.CANCELLED, ytj: ytjHeadcount }}
      />
    </div>
  )
}
