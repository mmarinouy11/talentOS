import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/role-guard'
import { draftResponse } from '@/lib/proposal-handlers'

// Prefilled composer data for "Propose by email" (one global opportunity match)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireRole(['ADMIN', 'RECRUITER'])
  if (who instanceof NextResponse) return who
  const { id } = await params
  return draftResponse(who.id, [id])
}
