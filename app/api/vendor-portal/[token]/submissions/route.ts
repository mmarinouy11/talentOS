import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { isCandidateInactive } from '@/lib/candidate-status'

const STAGE_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'On Hold',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const vendor = await db.vendor.findUnique({ where: { portalToken: token } })
  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const submissions = await db.candidatePosition.findMany({
    where: { candidate: { sourcedByVendorId: vendor.id, deletedAt: null } },
    include: {
      candidate: { select: { firstName: true, lastName: true, country: true } },
      position: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(submissions.map((cp) => ({
    id: cp.id,
    firstName: cp.candidate.firstName,
    lastInitial: cp.candidate.lastName?.[0] ?? '',
    country: cp.candidate.country,
    positionTitle: cp.position.title,
    stage: STAGE_LABELS[cp.stage] ?? cp.stage,
    isActive: !isCandidateInactive(cp),
    submittedAt: cp.createdAt.toISOString(),
  })))
}
