interface PositionCardProps {
  label: string
  count: number
  color?: string
}

export function PositionCard({ label, count, color = 'text-gray-900' }: PositionCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-semibold mt-1 ${color}`}>{count}</p>
    </div>
  )
}
