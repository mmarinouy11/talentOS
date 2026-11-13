import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { sendTestRedeploymentDigest } from '@/lib/redeployment-digest'

// ADMIN: send the digest to yourself (does not affect the Monday "New" markers)
export async function POST() {
  const who = await requireRole(['ADMIN'])
  if (who instanceof NextResponse) return who
  if (!who.email) return NextResponse.json({ error: 'Your user has no email' }, { status: 400 })
  try {
    await sendTestRedeploymentDigest(who.email)
    return NextResponse.json({ sentTo: who.email })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send the digest'
    console.error('[redeployment-digest] Test send failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
