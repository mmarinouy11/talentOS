import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/role-guard'
import { buildProposalDraft } from '@/lib/redeployment-proposal'

// Prefilled composer data for "Propose by email" (global opportunity matches only)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  const user = await db.user.findUnique({ where: { id: who.id }, select: { name: true, email: true, gmailRefreshToken: true } })
  try {
    const draft = await buildProposalDraft(id, user?.name ?? user?.email ?? '')
    if (!draft) return NextResponse.json({ error: 'This opportunity is no longer open' }, { status: 404 })
    return NextResponse.json({ ...draft, gmailConnected: !!user?.gmailRefreshToken })
  } catch (err) {
    console.error(`[redeployment-proposal] Draft failed for match ${id}:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not prepare the email' }, { status: 500 })
  }
}
