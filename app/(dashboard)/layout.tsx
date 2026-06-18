import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Link from 'next/link'
import type { Role } from '@prisma/client'

const navItems = [
  { href: '/positions', label: 'Positions' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/reports', label: 'Reports' },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const user = session.user as { name?: string | null; email?: string | null; role?: Role }

  const items = [...navItems]
  if (user.role === 'ADMIN') {
    items.push({ href: '/settings', label: 'Settings' })
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100">
          <span className="text-lg font-semibold text-gray-900">TalentOS</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-900 truncate">
            {user.name ?? user.email}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {user.role?.replace(/_/g, ' ')}
          </p>
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
