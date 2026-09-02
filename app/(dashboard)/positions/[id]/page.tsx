import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getMonthlyHoursBaseline, hourlyToMonthly } from '@/lib/dgm'
import { getFunnelData, getTimeInStage, getLeadTime } from '@/lib/analytics'
import { PositionStatusBadge } from '@/components/app/PositionStatusBadge'
import { PriorityBadge } from '@/components/app/PriorityBadge'
import { JDIntelligence } from '@/components/app/JDIntelligence'
import { PositionCandidatesPanel } from '@/components/app/PositionCandidatesPanel'
import { FunnelChart } from '@/components/app/FunnelChart'
import { VelocityTable } from '@/components/app/VelocityTable'
import { PositionInsights } from '@/components/app/PositionInsights'
import { PositionDeleteButton } from '@/components/app/PositionDeleteButton'
import { isCandidateInactive } from '@/lib/candidate-status'
import { VendorAssignment } from '@/components/app/VendorAssignment'
import { ApplicationPortalLink } from '@/components/app/ApplicationPortalLink'
import type { Role } from '@prisma/client'
import { randomBytes } from 'crypto'

// Stage order for picking the "most meaningful" interview to display.
// Higher = more advanced.
const INTERVIEW_STAGE_ORDER: Record<string, number> = {
  OFFER: 6,
  CLIENT_INTERVIEW: 5,
  MANAGER_INTERVIEW: 4,
  TECHNICAL_INTERVIEW: 3,
  SCREENING: 2,
  APPLIED: 1,
}

function pickLatestInterview(
  interviews: { status: string; decision: string | null; stage: string; scheduledAt: Date | null }[],
  cpStage: string
) {
  if (!interviews.length) return null
  // If the candidate's current stage is a terminal or APPLIED stage, fall back
  // to the most recent round (highest stage order), preferring a REJECT decision.
  if (cpStage === 'APPLIED' || cpStage === 'REJECTED' || cpStage === 'WITHDRAWN' || cpStage === 'HIRED') {
    const rejected = interviews.find((i) => i.decision === 'REJECT')
    if (rejected) return rejected
    return interviews.reduce((best, cur) =>
      (INTERVIEW_STAGE_ORDER[cur.stage] ?? 0) >= (INTERVIEW_STAGE_ORDER[best.stage] ?? 0) ? cur : best
    )
  }
  // For all active pipeline stages: only show a round that matches the
  // candidate's current stage. If none exists, return null (show "—").
  return interviews.find((i) => i.stage === cpStage) ?? null
}

function fmt(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function aging(createdAt: Date) {
  return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
}

function fmtTarget(position: { target_date_asap: boolean; target_date: Date | null }) {
  if (position.target_date_asap) return 'ASAP'
  if (!position.target_date) return '—'
  return fmt(position.target_date)
}

export default async function PositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sessionUser = session.user as { id?: string; role?: Role }
  const isAdmin = sessionUser.role === 'ADMIN'
  const currentUserId = sessionUser.id

  const { id } = await params

  const [position, assignedVendors] = await Promise.all([
  db.position.findFirst({
    where: { id, deletedAt: null },
    include: {
      recruiter: { select: { id: true, name: true, email: true } },
      candidatePositions: {
        where: { candidate: { deletedAt: null } },
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true, country: true, seniority: true, minimumCompensation: true } },
          interviews: { select: { status: true, decision: true, stage: true, scheduledAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  }),
  db.positionVendor.findMany({
    where: { positionId: id },
    include: { vendor: { select: { id: true, name: true, pocName: true, pocEmail: true, portalToken: true } } },
    orderBy: { assignedAt: 'asc' },
  }),
  ])

  if (!position) notFound()

  // Backfill applicationToken for positions created before the portal feature
  if (!position.applicationToken) {
    const applicationToken = randomBytes(32).toString('hex')
    await db.position.update({ where: { id }, data: { applicationToken } })
    position.applicationToken = applicationToken
  }

  const initialVendors = assignedVendors.map((pv) => pv.vendor)

  const [hoursBaseline, positionFunnel, positionTimeInStage, positionLeadTime, vendorMinSetting, directMinSetting] = await Promise.all([
    getMonthlyHoursBaseline(),
    getFunnelData(id),
    getTimeInStage(id),
    getLeadTime(id),
    db.systemSettings.findUnique({ where: { key: 'VENDOR_MIN_FIT_SCORE' } }),
    db.systemSettings.findUnique({ where: { key: 'DIRECT_MIN_FIT_SCORE' } }),
  ])
  const globalVendorMin = vendorMinSetting ? parseInt(vendorMinSetting.value) : 70
  const globalDirectMin = directMinSetting ? parseInt(directMinSetting.value) : 30

  const STAGE_ORDER: Record<string, number> = {
    HIRED: 0, OFFER: 1, CLIENT_INTERVIEW: 2, MANAGER_INTERVIEW: 3,
    TECHNICAL_INTERVIEW: 4, SCREENING: 5, APPLIED: 6, REJECTED: 7, WITHDRAWN: 8,
  }
  // Sort: most advanced stage first (HIRED→REJECTED), then fitScore desc (nulls last)
  const sortedCandidatePositions = [...position.candidatePositions].sort((a, b) => {
    const aStage = STAGE_ORDER[a.stage] ?? 8
    const bStage = STAGE_ORDER[b.stage] ?? 8
    if (aStage !== bStage) return aStage - bStage
    if (a.fitScore == null && b.fitScore == null) return 0
    if (a.fitScore == null) return 1
    if (b.fitScore == null) return -1
    return b.fitScore - a.fitScore
  })

  const days = aging(position.createdAt)
  const totalCandidates = position.candidatePositions.length
  const activeCandidates = position.candidatePositions.filter(
    (cp) => !isCandidateInactive(cp)
  ).length
  const notMovingForward = position.candidatePositions.filter(
    (cp) => isCandidateInactive(cp)
  ).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <nav className="text-sm text-gray-500 mb-1">
            <Link href="/positions" className="hover:text-gray-900">Positions</Link>
            <span className="mx-2">›</span>
            <span className="text-gray-900">{position.title}</span>
          </nav>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900">{position.title}</h1>
            <PositionStatusBadge status={position.status} />
            <PriorityBadge priority={position.priority} />
          </div>
          <p className="text-sm text-gray-500 mt-1">{position.client}</p>
          {position.status === 'CANCELLED' && (position.cancelledAt || position.cancelledReason) && (
            <p className="text-sm text-red-600 mt-1">
              Cancelled{position.cancelledAt ? ` on ${fmt(position.cancelledAt)}` : ''}
              {position.cancelledReason ? ` · ${position.cancelledReason}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <PositionDeleteButton positionId={id} positionTitle={position.title} />
          )}
          <Link href={`/positions/${id}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
        </div>
      </div>

      {/* Info + Financials combined card */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-4 gap-x-4 gap-y-3">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client</p>
            <p className="text-sm text-gray-900 mt-0.5">{position.client}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Lead Recruiter</p>
            <p className="text-sm text-gray-900 mt-0.5">{position.recruiter.name ?? position.recruiter.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Target Date</p>
            <p className="text-sm text-gray-900 mt-0.5">{fmtTarget(position)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
            <p className="text-sm text-gray-900 mt-0.5">{fmt(position.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {position.location.length > 0
                ? position.location.map((loc) => (
                    <span key={loc} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {loc}
                    </span>
                  ))
                : <span className="text-sm text-gray-900">—</span>
              }
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hiring Manager</p>
            <p className="text-sm text-gray-900 mt-0.5">{position.hiring_manager_name ?? '—'}</p>
            {position.hiring_manager_email && (
              <p className="text-xs text-gray-500">{position.hiring_manager_email}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sales Contact</p>
            <p className="text-sm text-gray-900 mt-0.5">{position.sales_contact_email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Headcount</p>
            <p className="text-sm text-gray-900 mt-0.5">{position.headcount ?? 1} position{(position.headcount ?? 1) !== 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">TalentID</p>
            <p className="text-sm text-gray-900 mt-0.5">{position.talentId ?? '—'}</p>
          </div>
          {(position.reportingEmails.length > 0 || position.reportingDays.length > 0) && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reporting</p>
              <p className="text-sm text-gray-900 mt-0.5">
                {position.reportingDays.length > 0
                  ? position.reportingDays.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(', ')
                  : 'No days set'}
                {position.reportingEmails.length > 0 && ` · ${position.reportingEmails.length} recipient${position.reportingEmails.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Partner Min Score</p>
            <p className="text-sm text-gray-900 mt-0.5">
              {position.vendorMinFitScore != null
                ? <>{position.vendorMinFitScore} <span className="text-xs text-gray-500">(custom)</span></>
                : <>{globalVendorMin} <span className="text-xs text-gray-400">(default)</span></>}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Direct Min Score</p>
            <p className="text-sm text-gray-900 mt-0.5">
              {position.directMinFitScore != null
                ? <>{position.directMinFitScore} <span className="text-xs text-gray-500">(custom)</span></>
                : <>{globalDirectMin} <span className="text-xs text-gray-400">(default)</span></>}
            </p>
          </div>
        </div>

        {(position.clientRate || position.internalCostBudget) && (
          <>
            <div className="border-t border-gray-100 my-3" />
            {position.dgmAtRisk && (
              <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="text-red-600 text-sm">⚠️</span>
                <p className="text-sm text-red-700 font-medium">Margin below minimum threshold</p>
              </div>
            )}
            <div className="grid grid-cols-4 gap-x-4 gap-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client Rate</p>
                <p className="text-sm text-gray-900 mt-0.5">{position.clientRate ? `$${position.clientRate.toLocaleString()}/hr` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Internal Budget</p>
                <p className="text-sm text-gray-900 mt-0.5">{position.internalCostBudget ? `$${position.internalCostBudget.toLocaleString()}/hr` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">DGM</p>
                <p className={`text-sm font-medium mt-0.5 ${position.dgmAtRisk ? 'text-red-600' : 'text-green-600'}`}>
                  {position.dgm != null ? `${(position.dgm * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 border-t-[2px] border-t-[#8CF000] px-4 py-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aging</p>
          <p className="text-3xl font-semibold mt-0.5 text-gray-900">{days}d</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 border-t-[2px] border-t-[#8CF000] px-4 py-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Candidates</p>
          <div className="flex items-baseline gap-3 mt-0.5 flex-wrap">
            <span className="text-3xl font-semibold text-gray-900">{totalCandidates}</span>
            <span className="text-sm text-gray-400">total</span>
            <span className="text-gray-200">|</span>
            <span className="text-lg font-semibold text-green-600">{activeCandidates}</span>
            <span className="text-sm text-gray-400">active</span>
            <span className="text-gray-200">|</span>
            <span className="text-lg font-semibold text-gray-400">{notMovingForward}</span>
            <span className="text-sm text-gray-400">not moving forward</span>
          </div>
        </div>
      </div>

      {/* Candidates */}
      <PositionCandidatesPanel
        positionId={id}
        positionTitle={position.title}
        positionTimezone={position.timezone ?? 'America/Montevideo'}
        candidatePositions={sortedCandidatePositions.map((cp) => ({
          id: cp.id,
          stage: cp.stage,
          status: cp.status,
          fitScore: cp.fitScore,
          createdAt: cp.createdAt.toISOString(),
          latestInterviewStatus: pickLatestInterview(cp.interviews, cp.stage)?.status ?? null,
          latestInterviewDecision: pickLatestInterview(cp.interviews, cp.stage)?.decision ?? null,
          latestInterviewScheduledAt: pickLatestInterview(cp.interviews, cp.stage)?.scheduledAt?.toISOString() ?? null,
          compensationOutOfRange:
            cp.candidate.minimumCompensation != null && position.internalCostBudget != null
              ? cp.candidate.minimumCompensation > hourlyToMonthly(position.internalCostBudget, hoursBaseline)
              : false,
          candidate: {
            id: cp.candidate.id,
            firstName: cp.candidate.firstName,
            lastName: cp.candidate.lastName,
            email: cp.candidate.email,
            country: cp.candidate.country,
            seniority: cp.candidate.seniority,
          },
        }))}
        activeCandidates={activeCandidates}
        currentUserId={currentUserId}
      />

      {/* JD Intelligence */}
      <JDIntelligence
        positionId={id}
        jdParsed={position.jdParsed}
        jdSummary={position.jdSummary}
        jdSkills={position.jdSkills}
        jdSeniority={position.jdSeniority}
        jdLanguages={position.jdLanguages}
        linkedinSearchQueries={position.linkedinSearchQueries}
        coreSkills={position.coreSkills}
      />

      {/* Position Velocity */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Position Velocity</h2>

        {/* Lead time for this position */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Lead Time</p>
          {positionLeadTime.positionLeadTime != null ? (
            <p className="text-2xl font-bold text-gray-900">
              {positionLeadTime.positionLeadTime}d
              <span className="text-sm font-normal text-gray-400 ml-2">to fill / close</span>
            </p>
          ) : (
            <p className="text-sm text-gray-400">
              {days}d and counting <span className="text-gray-300">(still open)</span>
            </p>
          )}
        </div>

        {/* Compact funnel */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Candidate Funnel</p>
          <FunnelChart data={positionFunnel} size="compact" />
        </div>

        {/* Time in stage */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Time in Stage</p>
          <VelocityTable data={positionTimeInStage} label="Avg Days in Stage" />
        </div>
      </div>

      {/* Pipeline Insights */}
      <PositionInsights
        positionId={id}
        initial={{
          summary: position.insightsSummary ?? null,
          commonStrengths: position.insightsCommonStrengths,
          commonConcerns: position.insightsCommonConcerns,
          bottleneckStage: position.insightsBottleneckStage ?? null,
          recommendation: position.insightsRecommendation ?? null,
          generatedAt: position.insightsGeneratedAt ?? null,
        }}
      />

      {/* Vendor Assignment */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Assigned Partners</h2>
        <VendorAssignment positionId={id} initialVendors={initialVendors} />
      </div>

      {/* Application Portal */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Application Portal</h2>
        <ApplicationPortalLink
          positionId={id}
          initialToken={position.applicationToken ?? null}
          screeningQuestions={position.screeningQuestions}
        />
      </div>

      {/* Job Description */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Job Description</h2>
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {position.description}
        </div>
      </div>
    </div>
  )
}
