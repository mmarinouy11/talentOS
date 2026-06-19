import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Link from 'next/link'
import Image from 'next/image'
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
    <div className="flex min-h-screen bg-white">
      <aside className="w-56 flex-shrink-0 bg-[#F5F0EB] border-r border-[#DADADA] flex flex-col">
        <div className="px-5 py-5 border-b border-[#DADADA]">
          {/* Replace /public/tenarai-logo-black.png with the real logo asset */}
          <div className="flex items-center gap-2">
            <Image
              src="/tenarai-logo-black.png"
              alt="Tenarai"
              height={22}
              width={100}
            />
            <span className="text-sm text-[#6E6A65]">TalentOS</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2 text-sm font-medium text-[#6E6A65] rounded-lg hover:text-[#000000] hover:bg-white/50 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-[#DADADA]">
          <p className="text-sm font-medium text-[#000000] truncate">
            {user.name ?? user.email}
          </p>
          <p className="text-xs text-[#6E6A65] mt-0.5">
            {user.role?.replace(/_/g, ' ')}
          </p>
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
