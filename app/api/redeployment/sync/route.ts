import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runRedeploymentSync } from '@/lib/redeployment-sync'

export const maxDuration = 300

// Manual roster sync (ADMIN only). New candidates are owned by the admin who runs it.
export async function POST() {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const summary = await runRedeploymentSync({ recruiterId: user.id })
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[redeployment] Manual sync failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
