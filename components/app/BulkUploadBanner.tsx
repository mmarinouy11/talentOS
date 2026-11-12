import Link from 'next/link'
import { getOpenBulkUploadsForPosition } from '@/lib/bulk-upload-data'

// Position page: one line per bulk CV batch that is processing or ready to review
export async function BulkUploadBanner({ positionId }: { positionId: string }) {
  const batches = await getOpenBulkUploadsForPosition(positionId)
  if (batches.length === 0) return null
  return (
    <div className="space-y-2">
      {batches.map((b) => (
        <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#8CF000] bg-[#F5F0EB] px-4 py-2.5 text-sm">
          <span className="text-[#2F2C29]">
            {b.status === 'PROCESSING'
              ? <>Processing bulk CV upload — <strong>{b.counts.processed}/{b.totalFiles}</strong> done</>
              : <>Bulk CV upload ready to review — <strong>{b.totalFiles}</strong> CV{b.totalFiles === 1 ? '' : 's'}</>}
          </span>
          <Link href={`/bulk-uploads/${b.id}`} className="shrink-0 font-medium text-[#2F2C29] underline underline-offset-2">
            {b.status === 'PROCESSING' ? 'View progress' : 'Review'}
          </Link>
        </div>
      ))}
    </div>
  )
}
