import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PositionStatusBadge } from '@/components/app/PositionStatusBadge'
import type { Stage } from '@prisma/client'

const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

function fmt(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function aging(createdAt: Date) {
  return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
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
      hiringManager: { select: { id: true, name: true, email: true } },
      candidatePositions: {
        where: { candidate: { deletedAt: null } },
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true, seniority: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!position) notFound()

  const days = aging(position.createdAt)
  const overSla = days > position.sla_days
  const activeCandidates = position.candidatePositions.filter(
    (cp) => !['HIRED', 'REJECTED'].includes(cp.stage)
  ).length

  const budgetStr =
    position.budget_min || position.budget_max
      ? [position.budget_min, position.budget_max]
          .filter(Boolean)
          .map((n) => `${position.currency} ${Number(n).toLocaleString()}`)
          .join(' – ')
      : '—'

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
          </div>
        </div>
        <Link href={`/positions/${id}/edit`}>
          <Button variant="outline">Edit</Button>
        </Link>
      </div>

      {/* Info grid */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-3 gap-6">
          {[
            { label: 'Department', value: position.department },
            { label: 'Recruiter', value: position.recruiter.name ?? position.recruiter.email },
            { label: 'Hiring Manager', value: position.hiringManager.name ?? position.hiringManager.email },
            { label: 'SLA', value: `${position.sla_days} days` },
            { label: 'Budget', value: budgetStr },
            { label: 'Created', value: fmt(position.createdAt) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="text-sm text-gray-900 mt-1">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aging</p>
          <p className={`text-3xl font-semibold mt-1 ${overSla ? 'text-red-600' : 'text-gray-900'}`}>{days}d</p>
          {overSla && <p className="text-xs text-red-500 mt-1">Exceeds {position.sla_days}d SLA</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Candidates</p>
          <p className="text-3xl font-semibold mt-1 text-gray-900">{position.candidatePositions.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Candidates</p>
          <p className="text-3xl font-semibold mt-1 text-blue-600">{activeCandidates}</p>
        </div>
      </div>

      {/* Tabs — static for now, JS-free server render */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-100">
          <div className="flex">
            <span className="px-6 py-3 text-sm font-medium text-gray-900 border-b-2 border-gray-900">
              Candidates ({position.candidatePositions.length})
            </span>
            <span className="px-6 py-3 text-sm font-medium text-gray-500">
              Job Description
            </span>
          </div>
        </div>

        {/* Candidates tab */}
        {position.candidatePositions.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No candidates yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Seniority</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {position.candidatePositions.map((cp) => (
                <tr key={cp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {cp.candidate.firstName} {cp.candidate.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{cp.candidate.email}</td>
                  <td className="px-4 py-3 text-gray-600">{cp.candidate.seniority ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {STAGE_LABELS[cp.stage]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
