'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface InsightsData {
  summary: string | null
  commonStrengths: string[]
  commonConcerns: string[]
  bottleneckStage: string | null
  recommendation: string | null
  generatedAt: string | Date | null
}

function timeAgo(date: string | Date) {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function PositionInsights({ positionId, initial }: { positionId: string; initial: InsightsData }) {
  const [data, setData] = useState<InsightsData>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notEnoughData, setNotEnoughData] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    setNotEnoughData(null)
    try {
      const res = await fetch(`/api/positions/${positionId}/generate-insights`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to generate insights'); return }
      if (json.notEnoughData) { setNotEnoughData(json.message); return }
      setData(json)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const hasInsights = !!data.summary && !!data.generatedAt

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Pipeline Insights</h2>
          {hasInsights && (
            <p className="text-xs text-gray-400 mt-0.5">Generated {timeAgo(data.generatedAt!)}</p>
          )}
        </div>
        <Button size="sm" variant={hasInsights ? 'outline' : 'default'} onClick={generate} disabled={loading}>
          {loading ? 'Analyzing…' : hasInsights ? 'Regenerate' : 'Generate Insights'}
        </Button>
      </div>

      {notEnoughData && (
        <p className="text-sm text-gray-400 italic">{notEnoughData}</p>
      )}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {!hasInsights && !notEnoughData && !error && (
        <p className="text-sm text-gray-400">
          Get AI-powered patterns from candidate feedback in this pipeline.
        </p>
      )}

      {hasInsights && (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">{data.summary}</p>

          {data.commonStrengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Common Strengths</p>
              <ul className="space-y-1">
                {data.commonStrengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-green-700">
                    <span className="mt-0.5 shrink-0">✓</span><span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.commonConcerns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Common Concerns</p>
              <ul className="space-y-1">
                {data.commonConcerns.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-orange-700">
                    <span className="mt-0.5 shrink-0">⚠</span><span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.bottleneckStage && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Bottleneck Stage</p>
              <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2.5 py-1 text-xs font-medium">
                {data.bottleneckStage}
              </span>
            </div>
          )}

          {data.recommendation && (
            <div className="rounded-lg bg-lime-50 border border-lime-200 px-4 py-3">
              <p className="text-xs font-medium text-lime-700 mb-1">Recommendation</p>
              <p className="text-sm text-lime-800">{data.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
