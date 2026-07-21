import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SeniorityBadge } from '@/components/app/SeniorityBadge'
import { SkillTags } from '@/components/app/SkillTags'
import { CandidateDetailClient } from '@/components/app/CandidateDetailClient'
import { CvSection } from '@/components/app/CvSection'

function SourceBadge({ type }: { type: 'RECRUITER' | 'VENDOR' | 'OTHER' | 'DIRECT' }) {
  const config = {
    RECRUITER: { label: 'Internal', className: 'bg-blue-100 text-blue-700' },
    VENDOR: { label: 'Partner', className: 'bg-purple-100 text-purple-700' },
    OTHER: { label: 'Other', className: 'bg-gray-100 text-gray-600' },
    DIRECT: { label: 'Direct', className: 'bg-green-100 text-green-700' },
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-gray-900">{candidate.phone}</p>
                    <a
                      href={`https://wa.me/${candidate.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in WhatsApp"
                      className="text-green-600 hover:text-green-700"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </a>
                  </div>
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
                  ) : candidate.sourcedByType === 'DIRECT' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">Direct Application</span>
                      <SourceBadge type="DIRECT" />
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
