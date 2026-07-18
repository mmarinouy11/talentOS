import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getMonthlyHoursBaseline, hourlyToMonthly } from '@/lib/dgm'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const vendor = await db.vendor.findUnique({
    where: { portalToken: token },
    include: {
      positionVendors: {
        include: {
          position: {
            select: {
              id: true,
              title: true,
              client: true,
              status: true,
              deletedAt: true,
              description: true,
              jdSummary: true,
              internalCostBudget: true,
              location: true,
            },
          },
        },
      },
    },
  })

  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const hoursBaseline = await getMonthlyHoursBaseline()

  const positions = vendor.positionVendors
    .map((pv) => pv.position)
    .filter((p) => !p.deletedAt)
    .map((p) => ({
      id: p.id,
      title: p.title,
      client: p.client,
      status: p.status,
      jdRaw: p.description ?? null,
      jdSummary: p.jdSummary ?? null,
      location: p.location ?? [],
      budgetMonthly: p.internalCostBudget != null
        ? Math.round(hourlyToMonthly(p.internalCostBudget, hoursBaseline))
        : null,
    }))

  const submissions = await db.candidatePosition.findMany({
    where: { candidate: { sourcedByVendorId: vendor.id, deletedAt: null } },
    include: {
      candidate: { select: { firstName: true, lastName: true } },
      position: { select: { title: true } },
      interviews: {
        orderBy: { roundNumber: 'desc' },
        take: 1,
        select: { status: true, roundLabel: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const STAGE_LABELS: Record<string, string> = {
    APPLIED: 'Applied',
    SCREENING: 'Screening',
    TECHNICAL_INTERVIEW: 'Technical Interview',
    MANAGER_INTERVIEW: 'Manager Interview',
    CLIENT_INTERVIEW: 'Client Interview',
    OFFER: 'Offer',
    HIRED: 'Hired',
    REJECTED: 'Rejected',
  }

  const INTERVIEW_STATUS_LABELS: Record<string, string> = {
    PENDING: 'Pending',
    AWAITING_SCHEDULE: 'Awaiting Schedule',
    SCHEDULED: 'Scheduled',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }

  return NextResponse.json({
    vendorId: vendor.id,
    vendorName: vendor.name,
    positions,
    submissions: submissions.map((cp) => ({
      id: cp.id,
      firstName: cp.candidate.firstName,
      lastInitial: cp.candidate.lastName?.[0] ?? '',
      positionTitle: cp.position.title,
      stage: STAGE_LABELS[cp.stage] ?? cp.stage,
      isActive: cp.status === 'ACTIVE' || cp.status === 'HIRED',
      latestInterview: cp.interviews[0]
        ? { label: cp.interviews[0].roundLabel, status: INTERVIEW_STATUS_LABELS[cp.interviews[0].status] ?? cp.interviews[0].status }
        : null,
      submittedAt: cp.createdAt.toISOString(),
    })),
  })
}
