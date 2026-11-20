import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { recordManualProposal } from '@/lib/redeployment-proposal'
import { parseProposalRequest } from '@/lib/proposal-request'

// "I sent it — mark as proposed" after the Open-in-Gmail fallback (method MANUAL)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  const parsed = parseProposalRequest(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    await recordManualProposal(id, who.id, parsed.msg)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not record the proposal' }, { status: 409 })
  }
}
