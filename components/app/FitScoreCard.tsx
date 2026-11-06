'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface FitScoreCardProps {
  candidatePositionId: string
  fitScore: number | null
  technicalFitScore: number | null
  seniorityFitScore: number | null
  domainFitScore: number | null
  communicationFitScore: number | null
  fitSummary: string | null
  fitStrengths: string[]
  fitGaps: string[]
  fitScoredAt: string | null
  strongestRoles?: string[]
  // Shown only when the suggested position is still OPEN and not fulfilled
  suggestion?: {
    positionId: string
    title: string
    client: string
    estimatedScore: number
    reason: string | null
    // candidate-position id when the candidate is already in that position
    existingCpId: string | null
  } | null
  candidateId?: string
  recruiterId?: string
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-yellow-600'
  if (score >= 50) return 'text-orange-600'
  return 'text-red-600'
}

function barColor(score: number): string {
  if (score >= 85) return 'bg-green-500'
  if (score >= 70) return 'bg-yellow-500'
  if (score >= 50) return 'bg-orange-500'
  return 'bg-red-500'
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  if (score === null) return null
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className={`font-medium ${scoreColor(score)}`}>{Math.round(score)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

export function FitScoreCard({
  candidatePositionId,
  fitScore,
  technicalFitScore,
  seniorityFitScore,
  domainFitScore,
  communicationFitScore,
  fitSummary,
  fitStrengths,
  fitGaps,
  fitScoredAt,
  strongestRoles = [],
  suggestion = null,
  candidateId,
  recruiterId,
}: FitScoreCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  // Same recruiter; the candidate-positions API triggers the full fit scoring for the new position
  async function addToSuggested() {
    if (!suggestion || !candidateId) return
    setAdding(true); setAddError('')
    try {
      const res = await fetch('/api/candidate-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, positionId: suggestion.positionId, recruiterId: recruiterId ?? null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAddError(data.error ?? 'Could not add to that position'); return }
      router.push(`/positions/${suggestion.positionId}/candidates/${data.id}`)
    } catch {
      setAddError('Could not add to that position')
    } finally {
      setAdding(false)
    }
  }

  async function score() {
    setLoading(true)
    await fetch(`/api/candidate-positions/${candidatePositionId}/score`, { method: 'POST' })
    setLoading(false)
    router.refresh()
  }

  if (fitScore === null) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-medium text-gray-900 mb-2">Fit Score</h2>
        <p className="text-sm text-gray-500 mb-4">Score this candidate against the position requirements using AI.</p>
        <Button size="sm" onClick={score} disabled={loading}>
          {loading ? 'Scoring…' : 'Score Candidate'}
        </Button>
      </div>
    )
  }

  const scoredAgo = fitScoredAt
    ? (() => {
        const days = Math.floor((Date.now() - new Date(fitScoredAt).getTime()) / 86400000)
        return days < 1 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`
      })()
    : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <h2 className="text-sm font-medium text-gray-900">Fit Score</h2>
        <div className="text-right">
          <span className={`text-3xl font-bold ${scoreColor(fitScore)}`}>{Math.round(fitScore)}</span>
          <span className="text-gray-400 text-sm">/100</span>
        </div>
      </div>

      <div className="space-y-2">
        <ScoreBar label="Technical Fit" score={technicalFitScore} />
        <ScoreBar label="Seniority Fit" score={seniorityFitScore} />
        <ScoreBar label="Domain Fit" score={domainFitScore} />
        <ScoreBar label="Communication Fit" score={communicationFitScore} />
      </div>

      {fitSummary && <p className="text-sm text-gray-700">{fitSummary}</p>}

      {strongestRoles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Strongest in:</span>
          {strongestRoles.map((r) => (
            <span key={r} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{r}</span>
          ))}
        </div>
      )}

      {suggestion && fitScore !== null && (
        <div className="rounded-lg border border-[#8CF000] bg-[#f9ffe6] px-3 py-2 space-y-2">
          <p className="text-sm text-gray-800" title={suggestion.reason ?? undefined}>
            <span className="font-semibold">Better match:</span>{' '}
            <a href={`/positions/${suggestion.positionId}`} className="font-medium underline underline-offset-2 hover:text-black">{suggestion.title}</a>
            <span className="text-gray-500"> · {suggestion.client}</span>
            <span className="text-gray-600"> — est. {suggestion.estimatedScore} vs {Math.round(fitScore)} here</span>
          </p>
          {suggestion.reason && <p className="text-xs text-gray-500">{suggestion.reason}</p>}
          {suggestion.existingCpId ? (
            <a href={`/positions/${suggestion.positionId}/candidates/${suggestion.existingCpId}`} className="inline-block text-xs font-medium text-gray-600 underline underline-offset-2">
              Already in that position
            </a>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={addToSuggested} disabled={adding || !candidateId}>
                {adding ? 'Adding…' : 'Add to that position'}
              </Button>
              {addError && <span className="text-xs text-red-600">{addError}</span>}
            </div>
          )}
        </div>
      )}

      {fitStrengths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Strengths</p>
          <ul className="space-y-1">
            {fitStrengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fitGaps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Gaps</p>
          <ul className="space-y-1">
            {fitGaps.map((g, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                <span className="text-orange-500 mt-0.5 shrink-0">⚠</span>{g}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        {scoredAgo && <span className="text-xs text-gray-400">Scored {scoredAgo}</span>}
        <Button variant="outline" size="sm" onClick={score} disabled={loading}>
          {loading ? 'Re-scoring…' : 'Re-score'}
        </Button>
      </div>
    </div>
  )
}
