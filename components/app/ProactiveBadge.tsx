export function ProactiveBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 ${className}`}>
      Proactive
    </span>
  )
}
