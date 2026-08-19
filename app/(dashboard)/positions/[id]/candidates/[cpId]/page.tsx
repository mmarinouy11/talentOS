import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getMonthlyHoursBaseline, hourlyToMonthly } from '@/lib/dgm'
import { SeniorityBadge } from '@/components/app/SeniorityBadge'
import { SkillTags } from '@/components/app/SkillTags'
import { FitScoreCard } from '@/components/app/FitScoreCard'
import { InterviewsSection } from '@/components/app/InterviewsSection'
import { CandidateInPositionHeader } from '@/components/app/CandidateInPositionHeader'

export default async function CandidateInPositionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; cpId: string }>
  searchParams: Promise<{ openInterview?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [{ id: positionId, cpId }, { openInterview }] = await Promise.all([params, searchParams])

  const cp = await db.candidatePosition.findFirst({
    where: { id: cpId },
    include: {
      candidate: {
        include: {
          candidatePositions: {
            where: { id: { not: cpId } },
            include: {
              position: { select: { id: true, title: true } },
              interviews: {
                orderBy: { createdAt: 'desc' },
                select: { stage: true, status: true, decision: true, scheduledAt: true },
              },
            },
            orderBy: { updatedAt: 'desc' },
          },
        },
      },
      position: { select: { id: true, title: true, client: true, internalCostBudget: true, jdSkills: true, coreSkills: true, timezone: true } },
      recruiter: { select: { name: true, email: true } },
      stageHistory: {
        orderBy: { movedAt: 'desc' },
        include: { movedBy: { select: { name: true, email: true } } },
      },
    },
  })

  if (!cp) notFound()

  const { candidate, position } = cp
  const hoursBaseline = await getMonthlyHoursBaseline()

  const STAGE_LABELS: Record<string, string> = {
    APPLIED: 'Applied', SCREENING: 'Screening', TECHNICAL_INTERVIEW: 'Technical Interview',
    MANAGER_INTERVIEW: 'Manager Interview', CLIENT_INTERVIEW: 'Client Interview',
    OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
  }
  const INTERVIEW_STAGE_ORDER: Record<string, number> = {
    OFFER: 6, CLIENT_INTERVIEW: 5, MANAGER_INTERVIEW: 4, TECHNICAL_INTERVIEW: 3, SCREENING: 2, APPLIED: 1,
  }
  function pickLatestInterview(
    interviews: { status: string; decision: string | null; stage: string; scheduledAt: Date | null }[],
    cpStage: string
  ) {
    if (!interviews.length) return null
    if (['APPLIED', 'REJECTED', 'WITHDRAWN', 'HIRED'].includes(cpStage)) {
      const rejected = interviews.find((i) => i.decision === 'REJECT')
      if (rejected) return rejected
      return interviews.reduce((best, cur) =>
        (INTERVIEW_STAGE_ORDER[cur.stage] ?? 0) >= (INTERVIEW_STAGE_ORDER[best.stage] ?? 0) ? cur : best
      )
    }
    return interviews.find((i) => i.stage === cpStage) ?? null
  }

  const otherPositions = candidate.candidatePositions ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <nav className="text-sm text-gray-500 mb-1 flex items-center gap-1.5">
          <Link href="/positions" className="hover:text-gray-900">Positions</Link>
          <span>›</span>
          <Link href={`/positions/${positionId}`} className="hover:text-gray-900">{position.title}</Link>
          <span>›</span>
          <span className="text-gray-900">{candidate.firstName} {candidate.lastName}</span>
        </nav>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-semibold text-gray-900">
            {candidate.firstName} {candidate.lastName}
          </h1>
          {candidate.seniority && <SeniorityBadge seniority={candidate.seniority} />}
          <CandidateInPositionHeader candidatePositionId={cp.id} stage={cp.stage} />
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{position.title} · {position.client}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-4">
        {/* Left column: profile, score, budget, notes, actions */}
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-sm font-medium text-gray-900">Profile</h2>
            <div className="text-sm space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
                <p className="text-gray-900 mt-0.5">{candidate.email}</p>
              </div>
              {candidate.phone && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</p>
                  <p className="text-gray-900 mt-0.5">{candidate.phone}</p>
                </div>
              )}
              {candidate.country && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Country</p>
                  <p className="text-gray-900 mt-0.5">{candidate.country}</p>
                </div>
              )}
              {candidate.yearsOfExperience != null && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Experience</p>
                  <p className="text-gray-900 mt-0.5">{candidate.yearsOfExperience} years</p>
                </div>
              )}
              {candidate.skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Skills</p>
                  <div className="mt-1"><SkillTags tags={candidate.skills} /></div>
                </div>
              )}
              {candidate.languages.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Languages</p>
                  <div className="mt-1"><SkillTags tags={candidate.languages} /></div>
                </div>
              )}
              {cp.stage === 'HIRED' && cp.startDate && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Expected Start Date</p>
                  <p className="text-gray-900 mt-0.5">
                    {new Date(cp.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Owner</p>
                <p className="text-gray-900 mt-0.5 text-sm">
                  {cp.recruiter.name ?? cp.recruiter.email}
                </p>
              </div>
            </div>
          </div>

          {candidate.summary && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-900 mb-2">Summary</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{candidate.summary}</p>
            </div>
          )}

          <FitScoreCard
            candidatePositionId={cp.id}
            fitScore={cp.fitScore}
            technicalFitScore={cp.technicalFitScore}
            seniorityFitScore={cp.seniorityFitScore}
            domainFitScore={cp.domainFitScore}
            communicationFitScore={cp.communicationFitScore}
            fitSummary={cp.fitSummary}
            fitStrengths={cp.fitStrengths}
            fitGaps={cp.fitGaps}
            fitScoredAt={cp.fitScoredAt?.toISOString() ?? null}
          />

          {/* Budget Fit */}
          {(() => {
            const minMonthly = candidate.minimumCompensation
            const budgetHourly = position.internalCostBudget
            const budgetMonthly = budgetHourly != null ? hourlyToMonthly(budgetHourly, hoursBaseline) : null
            const fmtMonthly = (n: number) => `$${Math.round(n).toLocaleString()}/mo`
            const outOfRange = minMonthly != null && budgetMonthly != null && minMonthly > budgetMonthly
            const withinBudget = minMonthly != null && budgetMonthly != null && minMonthly <= budgetMonthly
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-sm font-medium text-gray-900 mb-3">Budget Fit</h2>
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Desired (monthly)</p>
                    <p className="text-gray-900 mt-0.5">
                      {candidate.desiredCompensation != null ? fmtMonthly(candidate.desiredCompensation) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Minimum Acceptable (monthly)</p>
                    <p className="text-gray-900 mt-0.5">{minMonthly != null ? fmtMonthly(minMonthly) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Position Budget (monthly equiv.)</p>
                    <p className="text-gray-900 mt-0.5">
                      {budgetHourly != null && budgetMonthly != null
                        ? <span>${budgetHourly.toLocaleString()}/hr <span className="text-gray-400">(≈ {fmtMonthly(budgetMonthly)} at {hoursBaseline}hrs)</span></span>
                        : '—'}
                    </p>
                  </div>
                </div>
                {outOfRange && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <span className="text-red-600">⚠</span>
                    <p className="text-sm text-red-700 font-medium">
                      Exceeds position budget by {fmtMonthly(minMonthly! - budgetMonthly!)}
                    </p>
                  </div>
                )}
                {withinBudget && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <span className="text-green-600">✓</span>
                    <p className="text-sm text-green-700 font-medium">Within budget</p>
                  </div>
                )}
                {(minMonthly == null || budgetMonthly == null) && (
                  <p className="text-xs text-gray-400">
                    {minMonthly == null ? 'Set minimum compensation on the candidate profile' : 'No budget set on this position'} to see budget fit.
                  </p>
                )}
              </div>
            )
          })()}

          {/* Position Notes */}
          {cp.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-900 mb-2">Position Notes</h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{cp.notes}</p>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Link href={`/candidates/${candidate.id}`}>
              <Button variant="outline" size="sm">Full Profile</Button>
            </Link>
            <Link href={`/candidates/${candidate.id}/edit`}>
              <Button variant="outline" size="sm">Edit Candidate</Button>
            </Link>
            {candidate.cvDriveId ? (
              <a href={`/api/candidate-positions/${cp.id}/tenarai-cv`} target="_blank" rel="noopener noreferrer">
                <button className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-[#8CF000] text-[#8CF000] hover:bg-[#8CF000]/10 transition-colors whitespace-nowrap">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Tenarai CV
                </button>
              </a>
            ) : (
              <div className="inline-flex items-start gap-1.5 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 max-w-xs">
                <svg className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="text-xs text-amber-700">
                  No CV on file for this candidate.{' '}
                  <Link href={`/candidates/${candidate.id}/edit`} className="font-medium underline underline-offset-2">
                    Upload the candidate&apos;s original CV
                  </Link>{' '}
                  to generate the Tenarai CV.
                </span>
              </div>
            )}
            <Link href={`/positions/${positionId}`}>
              <Button variant="ghost" size="sm">← Back to Position</Button>
            </Link>
          </div>
        </div>

        {/* Right column: stage controls, interviews, stage history */}
        <div className="space-y-3">
          <InterviewsSection
            candidatePositionId={cp.id}
            candidateName={`${candidate.firstName} ${candidate.lastName}`}
            candidateEmail={candidate.email}
            positionTitle={position.title}
            clientName={position.client}
            positionTimezone={position.timezone ?? 'America/Montevideo'}
            initialOpenInterviewId={openInterview}
          />

          {cp.stageHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Stage History</h2>
              <div className="space-y-2">
                {cp.stageHistory.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 text-xs w-16 shrink-0">
                      {new Date(h.movedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {h.fromStage && (
                      <>
                        <span className="text-gray-500">{h.fromStage}</span>
                        <span className="text-gray-400">→</span>
                      </>
                    )}
                    <span className="font-medium text-gray-900">{h.toStage}</span>
                    <span className="text-gray-400 text-xs">by {h.movedBy.name ?? h.movedBy.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {otherPositions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Other Positions</h2>
              <div className="space-y-2">
                {otherPositions.map((other) => {
                  const latestInterview = pickLatestInterview(other.interviews, other.stage)
                  const isActive = other.status === 'ACTIVE'
                  let interviewLabel: string | null = null
                  if (latestInterview) {
                    const statusLabel: Record<string, string> = {
                      PENDING: 'Pending', AWAITING_SCHEDULE: 'Awaiting Schedule',
                      SCHEDULED: 'Scheduled', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
                    }
                    const decisionLabel: Record<string, string> = { ADVANCE: 'Advance', REJECT: 'Reject', HOLD: 'Hold' }
                    interviewLabel = statusLabel[latestInterview.status] ?? latestInterview.status
                    if (latestInterview.decision) interviewLabel += ` / ${decisionLabel[latestInterview.decision] ?? latestInterview.decision}`
                  }
                  return (
                    <div key={other.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <Link
                          href={`/positions/${other.position.id}/candidates/${other.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-gray-900 hover:underline underline-offset-2 line-clamp-1"
                        >
                          {other.position.title}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {STAGE_LABELS[other.stage] ?? other.stage}
                          {interviewLabel && <span className="text-gray-400"> · {interviewLabel}</span>}
                        </p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {isActive ? 'Active' : 'Not Moving Forward'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
