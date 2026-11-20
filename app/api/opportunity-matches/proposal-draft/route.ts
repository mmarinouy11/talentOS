import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { draftResponse, matchIdsFrom } from '@/lib/proposal-handlers'

// Composer data for one email proposing several people (body { matchIds }, same global opportunity)
export async function POST(request: Request) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const ids = matchIdsFrom(await request.json().catch(() => null))
  if (ids.length === 0) return NextResponse.json({ error: 'Select at least one person' }, { status: 400 })
  return draftResponse(who.id, ids)
}
