import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PositionForm } from '@/components/app/PositionForm'

export default async function NewPositionPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 mb-1">
          <Link href="/positions" className="hover:text-gray-900">Positions</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">New Position</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900">Create Position</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <PositionForm users={users} mode="create" />
      </div>
    </div>
  )
}
