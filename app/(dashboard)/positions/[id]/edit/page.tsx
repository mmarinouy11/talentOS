import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { PositionForm } from '@/components/app/PositionForm'

export default async function EditPositionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'

  const { id } = await params

  const [position, users] = await Promise.all([
    db.position.findFirst({ where: { id, deletedAt: null } }),
    db.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])

  if (!position) notFound()

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-1">
          <Link href="/positions" className="hover:text-gray-900">Positions</Link>
          <span className="mx-2">›</span>
          <Link href={`/positions/${id}`} className="hover:text-gray-900">{position.title}</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">Edit</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900">Edit Position</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <PositionForm
          users={users}
          mode="edit"
          isAdmin={isAdmin}
          defaultValues={{
            id: position.id,
            title: position.title,
            client: position.client,
            description: position.description,
            status: position.status,
            priority: position.priority,
            target_date_asap: position.target_date_asap,
            target_date: position.target_date?.toISOString() ?? null,
            location: position.location,
            recruiterId: position.recruiterId,
            hiring_manager_name: position.hiring_manager_name,
            hiring_manager_email: position.hiring_manager_email,
            sales_contact_email: position.sales_contact_email,
            clientRate: position.clientRate,
            internalCostBudget: position.internalCostBudget,
            vendorMinFitScore: position.vendorMinFitScore,
            directMinFitScore: position.directMinFitScore,
            headcount: position.headcount,
            talentId: position.talentId,
            timezone: position.timezone,
            reportingEmails: position.reportingEmails,
            reportingDays: position.reportingDays,
          }}
        />
      </div>
    </div>
  )
}
