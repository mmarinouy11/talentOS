import type { Stage } from '@prisma/client'

const config: Record<Stage, { label: string; className: string }> = {
  APPLIED: { label: 'Applied', className: 'bg-gray-100 text-gray-600' },
  SCREENING: { label: 'Screening', className: 'bg-blue-100 text-blue-700' },
  TECHNICAL_INTERVIEW: { label: 'Technical', className: 'bg-purple-100 text-purple-700' },
  MANAGER_INTERVIEW: { label: 'Manager Interview', className: 'bg-indigo-100 text-indigo-700' },
  CLIENT_INTERVIEW: { label: 'Client Interview', className: 'bg-orange-100 text-orange-700' },
  OFFER: { label: 'Offer', className: 'bg-yellow-100 text-yellow-700' },
  HIRED: { label: 'Hired', className: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  WITHDRAWN: { label: 'On Hold', className: 'bg-amber-100 text-amber-700' },
}

export function StageBadge({ stage }: { stage: Stage }) {
  const { label, className } = config[stage]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
