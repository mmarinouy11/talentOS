import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { manualResponse, matchIdsFrom } from '@/lib/proposal-handlers'

// "I sent it" for several people after the Open-in-Gmail fallback: per-person records with one batchId
export async function POST(request: Request) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const raw = await request.json().catch(() => null)
  const ids = matchIdsFrom(raw)
  if (ids.length === 0) return NextResponse.json({ error: 'Select at least one person' }, { status: 400 })
  return manualResponse(who.id, ids, raw)
}
