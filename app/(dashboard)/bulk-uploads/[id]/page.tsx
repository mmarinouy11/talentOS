import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { batchLabel, countItems } from '@/lib/bulk-upload-data'
import { getBulkUploadPreselectScore } from '@/lib/bulk-upload'
import { BulkStatusBadge } from '@/components/app/BulkUploadBadges'
import { BulkUploadReview, type ReviewRow } from '@/components/app/BulkUploadReview'

export default async function BulkUploadReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  const canAct = role === 'RECRUITER' || role === 'ADMIN'
  const { id } = await params

  const batch = await db.bulkUpload.findUnique({
    where: { id },
    include: {
      position: { select: { id: true, title: true, client: true } },
      createdBy: { select: { name: true, email: true } },
      items: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!batch) notFound()

  const ids = [...new Set(batch.items.flatMap((i) => [i.candidateId, i.possibleDuplicateOfId]).filter((x): x is string => !!x))]
  const [candidates, threshold] = await Promise.all([
    db.candidate.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true, deletedAt: true } }),
    getBulkUploadPreselectScore(),
  ])
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const person = (cid: string | null) => {
    const c = cid ? byId.get(cid) : undefined
    return c ? { id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email, deleted: !!c.deletedAt } : null
  }

  const rows: ReviewRow[] = batch.items.map((i) => ({
    id: i.id,
    fileName: i.fileName,
    driveFileId: i.driveFileId || null,
    status: i.status,
    matchType: i.matchType,
    error: i.error,
    parsedName: i.parsedName,
    parsedEmail: i.parsedEmail,
    candidate: person(i.candidateId),
    duplicateOf: i.status === 'NEEDS_DECISION' ? person(i.possibleDuplicateOfId) : null,
    alreadyInPosition: i.alreadyInPosition,
    fitScore: i.fitScore,
    inPipeline: !!i.candidatePositionId,
    selectable: !!batch.positionId && i.status === 'DONE' && !!i.candidateId && !i.alreadyInPosition && !i.candidatePositionId,
    preselected: !!batch.positionId && i.status === 'DONE' && !!i.candidateId && !i.alreadyInPosition
      && !i.candidatePositionId && i.fitScore != null && i.fitScore >= threshold,
  }))
  // Highest fit first; unscored rows keep upload order below
  rows.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1))

  const counts = countItems(batch.items)
  const open = batch.status === 'PROCESSING' || batch.status === 'READY'

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500 flex items-center gap-1">
          <Link href="/bulk-uploads" className="hover:text-gray-900">Bulk uploads</Link>
          <span>›</span>
          <span className="text-gray-900">{batchLabel(batch.position)}</span>
        </nav>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h1 className="text-2xl font-semibold text-gray-900">
            {batch.position ? <Link href={`/positions/${batch.position.id}`} className="hover:underline">{batchLabel(batch.position)}</Link> : 'Talent pool'}
          </h1>
          <BulkStatusBadge status={batch.status} />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Uploaded by {batch.createdBy.name ?? batch.createdBy.email} · {batch.createdAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          {' · '}{counts.processed}/{counts.total} processed
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          {([['New', counts.new], ['Existing', counts.existing], ['Possible duplicates', counts.possible], ['Missing contact', counts.missingContact], ['Failed', counts.failed], ['Skipped', counts.skipped]] as const).map(([label, n]) => (
            <span key={label} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-700"><strong className="text-[#2F2C29]">{n}</strong> {label.toLowerCase()}</span>
          ))}
        </div>
      </div>

      <BulkUploadReview
        bulkUploadId={batch.id}
        status={batch.status}
        hasPosition={!!batch.positionId}
        threshold={threshold}
        rows={rows}
        canAct={canAct && open}
      />
    </div>
  )
}
