// Brand colours only (lime / charcoal / cream); no green status colours
const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function BulkStatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    PROCESSING: ['Processing', 'bg-[#F5F0EB] text-[#2F2C29]'],
    READY: ['Ready to review', 'bg-[#8CF000] text-[#2F2C29]'],
    COMPLETED: ['Completed', 'bg-[#2F2C29] text-white'],
    CANCELLED: ['Cancelled', 'bg-gray-100 text-gray-500'],
  }
  const [label, cls] = map[status] ?? [status, 'bg-gray-100 text-gray-600']
  return <span className={`${base} ${cls}`}>{label}</span>
}

export function MatchBadge({ matchType, status }: { matchType: string | null; status: string }) {
  if (status === 'FAILED') return <span className={`${base} bg-red-50 text-red-700`}>Failed</span>
  if (status === 'SKIPPED') return <span className={`${base} bg-gray-100 text-gray-500`}>Skipped</span>
  if (status === 'PENDING' || status === 'PROCESSING') return <span className={`${base} bg-[#F5F0EB] text-gray-600`}>Processing…</span>
  if (matchType === 'NEW') return <span className={`${base} bg-[#8CF000] text-[#2F2C29]`}>New</span>
  if (matchType === 'EXISTING') return <span className={`${base} bg-[#2F2C29] text-white`}>Existing</span>
  if (matchType === 'POSSIBLE_DUPLICATE') return <span className={`${base} bg-amber-100 text-amber-800`}>Possible duplicate</span>
  return null
}
