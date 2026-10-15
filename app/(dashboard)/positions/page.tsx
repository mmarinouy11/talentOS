import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { PositionsDashboard } from '@/components/app/PositionsDashboard'
import type { Role } from '@prisma/client'

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
      type: true,
      cancelledReason: true,
      cancelledAt: true,
      recruiter: { select: { id: true, name: true, email: true } },
      _count: { select: { candidatePositions: true, positionVendors: true } },
      candidatePositions: { select: { status: true, startDate: true } },
    },
    orderBy: [{ client: 'asc' }, { createdAt: 'desc' }],
  })

  const today = new Date(); today.setUTCHours(0, 0, 0, 0)

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
    type: p.type,
    cancelledReason: p.cancelledReason,
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
    recruiter: p.recruiter,
    _count: p._count,
    isYtj: p.candidatePositions.some(
      (cp) => cp.status === 'HIRED' && cp.startDate != null && cp.startDate > today
    ),
  }))

  return (
    <div className="space-y-6">
      <PositionsDashboard positions={serialized} isAdmin={isAdmin} />
    </div>
  )
}
