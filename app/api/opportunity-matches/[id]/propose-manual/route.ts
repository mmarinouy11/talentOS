import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { manualResponse } from '@/lib/proposal-handlers'

// "I sent it — mark as proposed" after the Open-in-Gmail fallback (method MANUAL), one person
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  return manualResponse(who.id, [id], await request.json().catch(() => null))
}
