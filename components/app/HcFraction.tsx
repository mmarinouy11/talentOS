// Hired / headcount with the shared ○ ◐ ✓ indicator (no green)
export function HcFraction({ hired, headcount, className = '' }: { hired: number; headcount: number; className?: string }) {
  if (hired === 0) return <span className={`text-gray-400 ${className}`}>○ 0/{headcount}</span>
  if (hired >= headcount) return <span className={`text-[#2F2C29] font-medium ${className}`}>✓ {hired}/{headcount}</span>
  return <span className={`text-amber-500 ${className}`}>◐ {hired}/{headcount}</span>
}
