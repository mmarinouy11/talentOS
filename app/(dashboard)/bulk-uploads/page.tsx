import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { batchLabel, countItems } from '@/lib/bulk-upload-data'
import { BulkStatusBadge } from '@/components/app/BulkUploadBadges'

export default async function BulkUploadsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const batches = await db.bulkUpload.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, status: true, totalFiles: true, createdAt: true,
      position: { select: { title: true, client: true } },
      createdBy: { select: { name: true, email: true } },
      items: { select: { status: true, matchType: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <nav className="text-sm text-gray-500"><Link href="/candidates" className="hover:text-gray-900">Candidates</Link> › Bulk uploads</nav>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Bulk CV uploads</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-[2px] border-b-[#8CF000] bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2">Batch</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">CVs</th>
              <th className="px-4 py-2 text-right">New</th>
              <th className="px-4 py-2 text-right">Existing</th>
              <th className="px-4 py-2 text-right">Needs decision</th>
              <th className="px-4 py-2 text-right">Failed</th>
              <th className="px-4 py-2">Created by</th>
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {batches.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No bulk uploads yet</td></tr>
            )}
            {batches.map((b) => {
              const c = countItems(b.items)
              return (
                <tr key={b.id} className="hover:bg-[#F5F0EB] transition-colors">
                  <td className="px-4 py-2.5"><Link href={`/bulk-uploads/${b.id}`} className="font-medium text-gray-900 hover:underline">{batchLabel(b.position)}</Link></td>
                  <td className="px-4 py-2.5"><BulkStatusBadge status={b.status} />{b.status === 'PROCESSING' && <span className="ml-2 text-xs text-gray-500">{c.processed}/{c.total}</span>}</td>
                  <td className="px-4 py-2.5 text-right">{b.totalFiles}</td>
                  <td className="px-4 py-2.5 text-right">{c.new}</td>
                  <td className="px-4 py-2.5 text-right">{c.existing}</td>
                  <td className="px-4 py-2.5 text-right">{c.possible + c.missingContact}</td>
                  <td className="px-4 py-2.5 text-right">{c.failed}</td>
                  <td className="px-4 py-2.5 text-gray-600">{b.createdBy.name ?? b.createdBy.email}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{b.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
