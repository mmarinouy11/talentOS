import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { sendResponse, matchIdsFrom } from '@/lib/proposal-handlers'

export const maxDuration = 180

// One email from the current user's Gmail with every selected person's roster CV attached
// (body { matchIds, to, cc, subject, body }); one OpportunityProposal per person with a shared batchId
export async function POST(request: Request) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const raw = await request.json().catch(() => null)
  const ids = matchIdsFrom(raw)
  if (ids.length === 0) return NextResponse.json({ error: 'Select at least one person' }, { status: 400 })
  return sendResponse(who.id, ids, raw)
}
