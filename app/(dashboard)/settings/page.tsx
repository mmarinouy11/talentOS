import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/app/SettingsForm'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as { role?: string }
  if (user.role !== 'ADMIN') redirect('/positions')

  const settings = await db.systemSettings.findMany({ orderBy: { key: 'asc' } })
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Global platform configuration</p>
      </div>
      <SettingsForm
        settings={settings.map((s) => ({
          id: s.id,
          key: s.key,
          value: s.value,
          description: s.description,
        }))}
      />
    </div>
  )
}
