import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PositionCard } from '@/components/app/PositionCard'
import { PositionsTable } from '@/components/app/PositionsTable'
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
    },
    orderBy: [{ client: 'asc' }, { createdAt: 'desc' }],
  })

  const counts: Record<PositionStatus, number> = { OPEN: 0, ON_HOLD: 0, CLOSED: 0, FILLED: 0 }
  const headcounts: Record<PositionStatus, number> = { OPEN: 0, ON_HOLD: 0, CLOSED: 0, FILLED: 0 }
  for (const p of positions) {
    counts[p.status]++
    headcounts[p.status] += p.headcount ?? 1
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

      <div className="grid grid-cols-4 gap-4">
        <PositionCard label="Open" count={headcounts.OPEN} color="text-green-600" />
        <PositionCard label="On Hold" count={headcounts.ON_HOLD} color="text-yellow-600" />
        <PositionCard label="Closed" count={headcounts.CLOSED} color="text-gray-600" />
        <PositionCard label="Filled" count={headcounts.FILLED} color="text-blue-600" />
      </div>

      <PositionsTable positions={serialized} isAdmin={isAdmin} />
    </div>
  )
}
