import { NextResponse } from 'next/server'
import { db } from './db'
import { buildProposalDraft, sendProposal, recordManualProposal, AttachmentsTooLargeError } from './redeployment-proposal'
import { parseProposalRequest } from './proposal-request'
import { GmailNotConnectedError, GmailTokenExpiredError } from './email'

// Shared by the single-match routes (/api/opportunity-matches/[id]/…) and the multi-person ones (body.matchIds)
export function matchIdsFrom(raw: unknown): string[] {
  const ids = (raw as { matchIds?: unknown } | null)?.matchIds
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string').slice(0, 50) : []
}

export async function draftResponse(userId: string, matchIds: string[]) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, gmailRefreshToken: true } })
  try {
    const draft = await buildProposalDraft(matchIds, user?.name ?? user?.email ?? '')
    return NextResponse.json({ ...draft, gmailConnected: !!user?.gmailRefreshToken })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not prepare the email'
    console.error(`[redeployment-proposal] Draft failed for ${matchIds.length} match(es):`, message)
    return NextResponse.json({ error: message }, { status: 409 })
  }
}

export async function sendResponse(userId: string, matchIds: string[], raw: unknown) {
  const parsed = parseProposalRequest(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    const batchId = await sendProposal(matchIds, userId, parsed.msg)
    return NextResponse.json({ ok: true, batchId })
  } catch (err) {
    if (err instanceof GmailNotConnectedError) {
      return NextResponse.json({ error: 'Connect your Gmail to send from TalentOS', code: 'GMAIL_NOT_CONNECTED' }, { status: 409 })
    }
    if (err instanceof GmailTokenExpiredError) {
      return NextResponse.json({ error: 'Your Gmail connection expired. Reconnect your Gmail to send from TalentOS.', code: 'GMAIL_EXPIRED' }, { status: 409 })
    }
    if (err instanceof AttachmentsTooLargeError) return NextResponse.json({ error: err.message, code: 'TOO_LARGE' }, { status: 413 })
    const message = err instanceof Error ? err.message : 'Could not send the email'
    console.error(`[redeployment-proposal] Send failed for ${matchIds.length} match(es):`, message)
    return NextResponse.json({ error: `Not sent: ${message}` }, { status: 502 })
  }
}

export async function manualResponse(userId: string, matchIds: string[], raw: unknown) {
  const parsed = parseProposalRequest(raw)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    const batchId = await recordManualProposal(matchIds, userId, parsed.msg)
    return NextResponse.json({ ok: true, batchId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not record the proposal' }, { status: 409 })
  }
}
