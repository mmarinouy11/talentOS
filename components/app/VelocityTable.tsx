'use client'

import type { TimeToStageResult, TimeInStageResult, PipelineStage } from '@/lib/analytics'

const STAGE_LABELS: Record<PipelineStage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
}

interface Props {
  data: TimeToStageResult[] | TimeInStageResult[]
  label: string // column header for the days column
  emptyMessage?: string
}

export function VelocityTable({ data, label, emptyMessage = 'Not enough data yet.' }: Props) {
  const hasData = data.some((row) => row.sampleSize > 0)

  if (!hasData) {
    return <p className="text-sm text-gray-400">{emptyMessage}</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
          <th className="text-left px-3 py-2 font-medium text-gray-600">Stage</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600">{label}</th>
          <th className="text-right px-3 py-2 font-medium text-gray-600">Sample</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {data.map((row) => (
          <tr key={row.stage} className={row.sampleSize === 0 ? 'opacity-40' : ''}>
            <td className="px-3 py-2 text-gray-700">{STAGE_LABELS[row.stage]}</td>
            <td className="px-3 py-2 text-right font-medium text-gray-900">
              {row.sampleSize > 0 ? `${row.avgDays}d` : '—'}
            </td>
            <td className="px-3 py-2 text-right text-gray-400">{row.sampleSize}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
