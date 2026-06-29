import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { UsersManager } from '@/components/app/UsersManager'
import { SettingsNav } from '@/components/app/SettingsNav'

export default async function UsersSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as { role?: string }
  if (user.role !== 'ADMIN') redirect('/positions')

  const rawUsers = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, passwordHash: true },
    orderBy: { name: 'asc' },
  })
  const users = rawUsers.map(({ passwordHash, ...u }) => ({ ...u, pendingInvitation: passwordHash === null }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage team members</p>
      </div>
      <SettingsNav />
      <UsersManager initialUsers={users} />
    </div>
  )
}
