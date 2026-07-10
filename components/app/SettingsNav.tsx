'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/settings', label: 'General' },
  { href: '/settings/users', label: 'Users' },
  { href: '/settings/email-templates', label: 'Email Templates' },
]

export function SettingsNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map((tab) => {
        const active = tab.href === '/settings' ? pathname === '/settings' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
