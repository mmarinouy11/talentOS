'use client'

import type { FunnelStage, PipelineStage } from '@/lib/analytics'

const STAGE_LABELS: Record<PipelineStage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical',
  MANAGER_INTERVIEW: 'Manager',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
}

const STAGE_COLORS: Record<PipelineStage, string> = {
  APPLIED: 'bg-blue-100 text-blue-800',
  SCREENING: 'bg-blue-200 text-blue-900',
  TECHNICAL_INTERVIEW: 'bg-indigo-200 text-indigo-900',
  MANAGER_INTERVIEW: 'bg-indigo-300 text-indigo-900',
  CLIENT_INTERVIEW: 'bg-violet-200 text-violet-900',
  OFFER: 'bg-purple-300 text-purple-900',
  HIRED: 'bg-green-200 text-green-900',
}

interface Props {
  data: FunnelStage[]
  size?: 'large' | 'compact'
}

export function FunnelChart({ data, size = 'large' }: Props) {
  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return <p className="text-sm text-gray-400">Not enough data yet.</p>
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1)

  // Find bottleneck: lowest conversion rate (excluding first stage which has null)
  let bottleneckStage: PipelineStage | null = null
  let lowestRate = Infinity
  for (const item of data) {
    if (item.conversionFromPrevious != null && item.conversionFromPrevious < lowestRate) {
      lowestRate = item.conversionFromPrevious
      bottleneckStage = item.stage
    }
  }

  const isCompact = size === 'compact'

  return (
    <div className={`space-y-${isCompact ? '1.5' : '2'}`}>
      {data.map((item) => {
        const widthPct = maxCount > 0 ? (item.count / maxCount) * 100 : 0
        const isBottleneck = item.stage === bottleneckStage && item.count > 0
        const colorClass = STAGE_COLORS[item.stage]

        return (
          <div key={item.stage}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-xs font-medium text-gray-600 ${isCompact ? 'w-24' : 'w-32'} shrink-0`}>
                {STAGE_LABELS[item.stage]}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full overflow-hidden" style={{ height: isCompact ? 20 : 28 }}>
                <div
                  className={`h-full rounded-full flex items-center px-2 transition-all ${colorClass}`}
                  style={{ width: `${Math.max(widthPct, item.count > 0 ? 4 : 0)}%` }}
                >
                  {item.count > 0 && (
                    <span className={`font-semibold whitespace-nowrap ${isCompact ? 'text-xs' : 'text-sm'}`}>
                      {item.count}
                    </span>
                  )}
                </div>
              </div>
              <div className={`${isCompact ? 'w-14' : 'w-20'} shrink-0 text-right`}>
                {item.conversionFromPrevious != null ? (
                  <span className={`font-medium ${isCompact ? 'text-xs' : 'text-sm'} ${isBottleneck ? 'text-red-600' : 'text-gray-600'}`}>
                    {item.conversionFromPrevious}%
                  </span>
                ) : (
                  <span className={`text-gray-400 ${isCompact ? 'text-xs' : 'text-sm'}`}>—</span>
                )}
              </div>
              {isBottleneck && !isCompact && (
                <span className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                  ⚠ Biggest drop-off
                </span>
              )}
            </div>
            {isBottleneck && isCompact && (
              <div className="ml-[6.5rem] text-xs text-red-600 mb-0.5">⚠ Biggest drop-off</div>
            )}
          </div>
        )
      })}
      <p className="text-xs text-gray-400 pt-1">Conversion % shows rate from previous stage.</p>
    </div>
  )
}
