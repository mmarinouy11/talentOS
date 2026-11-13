import { lwdChip } from '@/lib/redeployment-display'

// "Redeploy" source badge (never "Internal", which is recruiter-sourced). Not for partner/vendor portals.
export function RedeployBadge() {
  return <span className="inline-flex items-center rounded-full bg-[#2F2C29] px-2 py-0.5 text-xs font-medium text-[#8CF000] whitespace-nowrap">Redeploy</span>
}

export function LwdChip({ lwd }: { lwd: Date | string | null | undefined }) {
  const chip = lwdChip(lwd)
  if (!chip) return null
  const cls = chip.tone === 'soon' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{chip.label}</span>
}
