interface PositionCardProps {
  label: string
  count: number
  headcount?: number
  color?: string
}

export function PositionCard({ label, count, headcount, color = 'text-gray-900' }: PositionCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 border-t-[2px] border-t-[#8CF000]">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-semibold mt-1 ${color}`}>{count}</p>
      {headcount !== undefined && (
        <p className="text-xs text-gray-500 mt-1">{headcount} headcount</p>
      )}
    </div>
  )
}
