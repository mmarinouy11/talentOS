import type { Seniority } from '@prisma/client'

const config: Record<Seniority, { label: string; className: string }> = {
  JUNIOR: { label: 'Junior', className: 'bg-gray-100 text-gray-600' },
  MID: { label: 'Mid', className: 'bg-blue-100 text-blue-700' },
  SENIOR: { label: 'Senior', className: 'bg-green-100 text-green-700' },
  STAFF: { label: 'Staff', className: 'bg-purple-100 text-purple-700' },
  PRINCIPAL: { label: 'Principal', className: 'bg-orange-100 text-orange-700' },
}

export function SeniorityBadge({ seniority }: { seniority: Seniority }) {
  const { label, className } = config[seniority]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
