import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SeniorityBadge } from '@/components/app/SeniorityBadge'
import { SkillTags } from '@/components/app/SkillTags'
import { CandidateDetailClient } from '@/components/app/CandidateDetailClient'
import { CvSection } from '@/components/app/CvSection'

function SourceBadge({ type }: { type: 'RECRUITER' | 'VENDOR' | 'OTHER' }) {
  const config = {
    RECRUITER: { label: 'Internal', className: 'bg-blue-100 text-blue-700' },
    VENDOR: { label: 'Partner', className: 'bg-purple-100 text-purple-700' },
    OTHER: { label: 'Other', className: 'bg-gray-100 text-gray-600' },
  }
  const { label, className } = config[type]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params

  const candidate = await db.candidate.findFirst({
    where: { id, deletedAt: null },
    include: {
      candidatePositions: {
        include: {
          position: { select: { title: true, client: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      sourcedByUser: { select: { id: true, name: true, email: true } },
      sourcedByVendor: { select: { id: true, name: true } },
      recruiter: { select: { id: true, name: true, email: true } },
    },
  })

  if (!candidate) notFound()

  const serializedPositions = candidate.candidatePositions.map((cp) => ({
    id: cp.id,
    stage: cp.stage,
    stageEnteredAt: cp.stageEnteredAt.toISOString(),
    notes: cp.notes,
    position: cp.position,
  }))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <nav className="text-sm text-gray-500 mb-1">
            <Link href="/candidates" className="hover:text-gray-900">Candidates</Link>
            <span className="mx-2">›</span>
            <span className="text-gray-900">{candidate.firstName} {candidate.lastName}</span>
          </nav>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-2xl font-semibold text-gray-900">
              {candidate.firstName} {candidate.lastName}
            </h1>
            {candidate.seniority && <SeniorityBadge seniority={candidate.seniority} />}
          </div>
          <p className="text-sm text-gray-500 mt-1">{candidate.email}</p>
        </div>
        <Link href={`/candidates/${id}/edit`}>
          <Button variant="outline">Edit</Button>
        </Link>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-3 gap-4">
        {/* Left: Candidate info */}
        <div className="col-span-1 space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-sm font-medium text-gray-900">Profile</h2>
            <div className="space-y-3 text-sm">
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
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recruiter (Owner)</p>
                <p className="text-gray-900 mt-0.5">
                  {candidate.recruiter ? (candidate.recruiter.name ?? candidate.recruiter.email) : <span className="text-gray-400">Not assigned</span>}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sourced By</p>
                <div className="mt-0.5">
                  {!candidate.sourcedByType ? (
                    <p className="text-gray-400">Not specified</p>
                  ) : candidate.sourcedByType === 'RECRUITER' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">
                        {candidate.sourcedByUser?.name ?? candidate.sourcedByUser?.email ?? '—'}
                      </span>
                      <SourceBadge type="RECRUITER" />
                    </div>
                  ) : candidate.sourcedByType === 'VENDOR' ? (
                    <div className="flex items-center gap-2">
                      {candidate.sourcedByVendor ? (
                        <Link
                          href={`/vendors/${candidate.sourcedByVendor.id}/edit`}
                          className="text-gray-900 hover:underline"
                        >
                          {candidate.sourcedByVendor.name}
                        </Link>
                      ) : (
                        <span className="text-gray-900">—</span>
                      )}
                      <SourceBadge type="VENDOR" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">{candidate.sourcedByOther ?? '—'}</span>
                      <SourceBadge type="OTHER" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Skills</p>
                <div className="mt-1">
                  <SkillTags tags={candidate.skills} />
                </div>
              </div>
              {candidate.languages.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Languages</p>
                  <div className="mt-1">
                    <SkillTags tags={candidate.languages} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <CvSection
            candidateId={id}
            cvDriveId={candidate.cvDriveId ?? null}
            cvOriginalName={candidate.cvOriginalName ?? null}
          />

          {candidate.summary && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-900 mb-2">Summary</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{candidate.summary}</p>
            </div>
          )}
        </div>

        {/* Right: Positions */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <CandidateDetailClient
              candidateId={id}
              candidatePositions={serializedPositions}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
