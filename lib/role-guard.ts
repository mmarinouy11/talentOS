import { NextResponse } from 'next/server'
import { auth } from './auth'

// API guard: returns the user or a 401/403 response
export async function requireRole(roles: string[]): Promise<{ id: string; role: string; email: string | null } | NextResponse> {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string; email?: string | null } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.role || !roles.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return { id: user.id, role: user.role, email: user.email ?? null }
}
