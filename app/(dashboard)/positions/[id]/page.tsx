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

  const { id } = await params

  const position = await db.position.findFirst({
    where: { id, deletedAt: null },
    include: {
      recruiter: { select: { id: true, name: true, email: true } },
      candidatePositions: {
        where: { candidate: { deletedAt: null } },
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true, seniority: true, minimumCompensation: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!position) notFound()

  const [hoursBaseline, positionFunnel, positionTimeInStage, positionLeadTime] = await Promise.all([
    getMonthlyHoursBaseline(),
    getFunnelData(id),
    getTimeInStage(id),
    getLeadTime(id),
  ])
  const days = aging(position.createdAt)
  const activeCandidates = position.candidatePositions.filter(
    (cp) => !['HIRED', 'REJECTED'].includes(cp.stage)
  ).length

  return (
    <div className="space-y-6">
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
        </div>
        <Link href={`/positions/${id}/edit`}>
          <Button variant="outline">Edit</Button>
        </Link>
      </div>

      {/* Info grid */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client</p>
            <p className="text-sm text-gray-900 mt-1">{position.client}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recruiter</p>
            <p className="text-sm text-gray-900 mt-1">{position.recruiter.name ?? position.recruiter.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Target Date</p>
            <p className="text-sm text-gray-900 mt-1">{fmtTarget(position)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</p>
            <div className="flex flex-wrap gap-1 mt-1">
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
            <p className="text-sm text-gray-900 mt-1">{position.hiring_manager_name ?? '—'}</p>
            {position.hiring_manager_email && (
              <p className="text-xs text-gray-500">{position.hiring_manager_email}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sales Contact</p>
            <p className="text-sm text-gray-900 mt-1">{position.sales_contact_email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</p>
            <p className="text-sm text-gray-900 mt-1">{fmt(position.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Financials */}
      {(position.clientRate || position.internalCostBudget) && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-900 mb-4">Financials</h2>
          {position.dgmAtRisk && (
            <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <span className="text-red-600">⚠️</span>
              <p className="text-sm text-red-700 font-medium">This position&apos;s margin is below the minimum threshold</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client Rate</p>
              <p className="text-sm text-gray-900 mt-1">{position.clientRate ? `$${position.clientRate.toLocaleString()}/hr` : '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Internal Budget</p>
              <p className="text-sm text-gray-900 mt-1">{position.internalCostBudget ? `$${position.internalCostBudget.toLocaleString()}/hr` : '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">DGM</p>
              <p className={`text-sm font-medium mt-1 ${position.dgmAtRisk ? 'text-red-600' : 'text-green-600'}`}>
                {position.dgm != null ? `${(position.dgm * 100).toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* JD Intelligence */}
      <JDIntelligence
        positionId={id}
        jdParsed={position.jdParsed}
        jdSummary={position.jdSummary}
        jdSkills={position.jdSkills}
        jdSeniority={position.jdSeniority}
        jdLanguages={position.jdLanguages}
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 border-t-[2px] border-t-[#8DF000] px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aging</p>
          <p className="text-3xl font-semibold mt-1 text-gray-900">{days}d</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 border-t-[2px] border-t-[#8DF000] px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Candidates</p>
          <p className="text-3xl font-semibold mt-1 text-gray-900">{position.candidatePositions.length}</p>
        </div>
      </div>

      {/* Candidates */}
      <PositionCandidatesPanel
        positionId={id}
        candidatePositions={position.candidatePositions.map((cp) => ({
          id: cp.id,
          stage: cp.stage,
          fitScore: cp.fitScore,
          compensationOutOfRange:
            cp.candidate.minimumCompensation != null && position.internalCostBudget != null
              ? cp.candidate.minimumCompensation > hourlyToMonthly(position.internalCostBudget, hoursBaseline)
              : false,
          candidate: {
            id: cp.candidate.id,
            firstName: cp.candidate.firstName,
            lastName: cp.candidate.lastName,
            email: cp.candidate.email,
            seniority: cp.candidate.seniority,
          },
        }))}
        activeCandidates={activeCandidates}
      />

      {/* Position Velocity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
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

      {/* Job Description */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Job Description</h2>
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {position.description}
        </div>
      </div>
    </div>
  )
}
