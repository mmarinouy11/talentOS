import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import Image from 'next/image'
import type { Role } from '@prisma/client'
import { SidebarNav } from '@/components/app/SidebarNav'
import { SidebarLogout } from '@/components/app/SidebarLogout'
import { GmailReminderBanner } from '@/components/app/GmailReminderBanner'

const navItems = [
  { href: '/positions', label: 'Positions' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/vendors', label: 'Partners' },
  { href: '/reports', label: 'Reports' },
  { href: '/reports/pipeline', label: 'Pipeline Report' },
  { href: '/profile', label: 'My Profile' },
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

  const user = session.user as { id?: string; name?: string | null; email?: string | null; role?: Role }

  const dbUser = user.id
    ? await db.user.findUnique({ where: { id: user.id }, select: { gmailConnectedEmail: true } })
    : null
  const gmailConnected = !!dbUser?.gmailConnectedEmail

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

        <SidebarNav items={items} />

        <div className="px-5 py-4 border-t border-[#DADADA]">
          <p className="text-sm font-medium text-[#000000] truncate">
            {user.name ?? user.email}
          </p>
          <p className="text-xs text-[#6E6A65] mt-0.5">
            {user.role?.replace(/_/g, ' ')}
          </p>
          <SidebarLogout />
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        {!gmailConnected && <GmailReminderBanner />}
        <div className="p-8 flex-1">{children}</div>
      </main>
    </div>
  )
}
