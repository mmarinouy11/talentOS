'use client'

import { signOut } from 'next-auth/react'

export function SidebarLogout() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="mt-2 text-xs text-[#6E6A65] hover:text-red-600 transition-colors"
    >
      Log out
    </button>
  )
}
