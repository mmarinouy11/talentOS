import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { sendResponse } from '@/lib/proposal-handlers'

export const maxDuration = 120

// One person: same as POST /api/opportunity-matches/propose with matchIds [id]
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  return sendResponse(who.id, [id], await request.json().catch(() => null))
}
