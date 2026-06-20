import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getMonthlyHoursBaseline, hourlyToMonthly } from '@/lib/dgm'
import { SeniorityBadge } from '@/components/app/SeniorityBadge'
import { StageBadge } from '@/components/app/StageBadge'
import { SkillTags } from '@/components/app/SkillTags'
import { FitScoreCard } from '@/components/app/FitScoreCard'
import { InterviewsSection } from '@/components/app/InterviewsSection'

export default async function CandidateInPositionPage({
  params,
}: {
  params: Promise<{ id: string; cpId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id: positionId, cpId } = await params

  const cp = await db.candidatePosition.findFirst({
    where: { id: cpId },
    include: {
      candidate: true,
      position: { select: { id: true, title: true, client: true, internalCostBudget: true } },
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

  return (
    <div className="space-y-6">
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
          <StageBadge stage={cp.stage} />
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{position.title} · {position.client}</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: candidate profile */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
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
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Owner</p>
                <p className="text-gray-900 mt-0.5 text-sm">
                  {cp.recruiter.name ?? cp.recruiter.email}
                </p>
              </div>
            </div>
          </div>

          {candidate.summary && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-medium text-gray-900 mb-2">Summary</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{candidate.summary}</p>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Link href={`/candidates/${candidate.id}`}>
              <Button variant="outline" size="sm">Full Profile</Button>
            </Link>
            <Link href={`/candidates/${candidate.id}/edit`}>
              <Button variant="outline" size="sm">Edit Candidate</Button>
            </Link>
            <Link href={`/positions/${positionId}`}>
              <Button variant="ghost" size="sm">← Back to Position</Button>
            </Link>
          </div>
        </div>

        {/* Right: Fit Score + Stage History */}
        <div className="col-span-2 space-y-4">
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

          {/* Budget Fit (read-only, monthly comparison) */}
          {(() => {
            const minMonthly = candidate.minimumCompensation
            const budgetHourly = position.internalCostBudget
            const budgetMonthly = budgetHourly != null ? hourlyToMonthly(budgetHourly, hoursBaseline) : null
            const fmtMonthly = (n: number) => `$${Math.round(n).toLocaleString()}/mo`
            const outOfRange = minMonthly != null && budgetMonthly != null && minMonthly > budgetMonthly
            const withinBudget = minMonthly != null && budgetMonthly != null && minMonthly <= budgetMonthly
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
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

          <InterviewsSection candidatePositionId={cp.id} />

          {cp.stageHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
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
        </div>
      </div>
    </div>
  )
}
