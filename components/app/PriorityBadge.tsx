import type { Priority } from '@prisma/client'

const config: Record<Priority, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'bg-gray-100 text-gray-600' },
  MEDIUM: { label: 'Medium', className: 'bg-blue-100 text-blue-700' },
  HIGH: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Urgent', className: 'bg-red-100 text-red-700' },
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, className } = config[priority] ?? config['MEDIUM']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {priority === 'URGENT' && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#8CF000' }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: '#8CF000' }} />
        </span>
      )}
      {label}
    </span>
  )
}
