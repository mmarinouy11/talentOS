import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { sendProposal } from '@/lib/redeployment-proposal'
import { parseProposalRequest } from '@/lib/proposal-request'
import { GmailNotConnectedError, GmailTokenExpiredError } from '@/lib/email'

export const maxDuration = 120

// Sends from the current user's Gmail with the roster CV attached. The match becomes PROPOSED only when Gmail
// accepted the message; not connected / expired → 409 with a code so the UI offers reconnect + "Open in Gmail".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  const parsed = parseProposalRequest(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    await sendProposal(id, who.id, parsed.msg)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof GmailNotConnectedError) {
      return NextResponse.json({ error: 'Connect your Gmail to send from TalentOS', code: 'GMAIL_NOT_CONNECTED' }, { status: 409 })
    }
    if (err instanceof GmailTokenExpiredError) {
      return NextResponse.json({ error: 'Your Gmail connection expired. Reconnect your Gmail to send from TalentOS.', code: 'GMAIL_EXPIRED' }, { status: 409 })
    }
    const message = err instanceof Error ? err.message : 'Could not send the email'
    console.error(`[redeployment-proposal] Send failed for match ${id}:`, message)
    return NextResponse.json({ error: `Not sent: ${message}` }, { status: 502 })
  }
}
