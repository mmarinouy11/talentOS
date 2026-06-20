'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem { href: string; label: string }

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-0 py-2 text-sm font-medium rounded-lg transition-colors overflow-hidden ${
              isActive
                ? 'text-[#000000] bg-white/60'
                : 'text-[#6E6A65] hover:text-[#000000] hover:bg-white/50'
            }`}
          >
            {/* Lima accent left border for active item */}
            <span
              className="flex-shrink-0 self-stretch w-[3px] rounded-sm mr-3 ml-0"
              style={{ background: isActive ? '#8DF000' : 'transparent' }}
            />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
