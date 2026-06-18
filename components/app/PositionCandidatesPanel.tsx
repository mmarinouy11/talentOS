'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AddCandidateToPositionModal } from './AddCandidateToPositionModal'
import type { Stage } from '@prisma/client'

const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-yellow-600'
  if (score >= 50) return 'text-orange-600'
  return 'text-red-600'
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-400 inline" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

interface CandidatePosition {
  id: string
  stage: Stage
  fitScore: number | null
  candidate: {
    id: string
    firstName: string
    lastName: string
    email: string
    seniority: string | null
  }
}

interface Props {
  positionId: string
  candidatePositions: CandidatePosition[]
  activeCandidates: number
}

export function PositionCandidatesPanel({ positionId, candidatePositions: initial, activeCandidates }: Props) {
  const [rows, setRows] = useState<CandidatePosition[]>(initial)
  const [showModal, setShowModal] = useState(false)
  // live fit scores: cpId → number | null (null = still scoring)
  const [liveScores, setLiveScores] = useState<Record<string, number | null>>({})
  // set of cpIds currently being polled
  const [scoringIds, setScoringIds] = useState<Set<string>>(new Set())

  // Poll a candidatePositionId until fitScore arrives
  const startPolling = useCallback((cpId: string) => {
    setScoringIds((prev) => new Set([...prev, cpId]))

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/candidate-positions/${cpId}`)
        if (!res.ok) { clearInterval(interval); return }
        const data = await res.json()
        if (data.fitScore != null) {
          clearInterval(interval)
          setLiveScores((prev) => ({ ...prev, [cpId]: data.fitScore }))
          setScoringIds((prev) => {
            const next = new Set(prev)
            next.delete(cpId)
            return next
          })
        }
      } catch {
        clearInterval(interval)
      }
    }, 3000)

    // Safety: stop polling after 2 minutes regardless
    setTimeout(() => clearInterval(interval), 120_000)
  }, [])

  function handleCandidateAdded(newRow: CandidatePosition) {
    setRows((prev) => [...prev, newRow])
    startPolling(newRow.id)
  }

  const existingCandidateIds = new Set(rows.map((cp) => cp.candidate.id))

  function fitCell(cp: CandidatePosition) {
    // live score arrived
    if (liveScores[cp.id] != null) {
      const score = liveScores[cp.id]!
      return <span className={`font-medium ${scoreColor(score)}`}>{Math.round(score)}</span>
    }
    // currently scoring
    if (scoringIds.has(cp.id)) return <Spinner />
    // already had a score from server
    if (cp.fitScore != null) {
      return <span className={`font-medium ${scoreColor(cp.fitScore)}`}>{Math.round(cp.fitScore)}</span>
    }
    return <span className="text-gray-400">—</span>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-900">
            Candidates ({rows.length})
          </span>
          <span className="ml-4 text-sm text-gray-500">{activeCandidates} active</span>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}>Add Candidate</Button>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No candidates yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Seniority</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Fit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((cp) => (
              <tr
                key={cp.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => { window.location.href = `/positions/${positionId}/candidates/${cp.id}` }}
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  <Link
                    href={`/positions/${positionId}/candidates/${cp.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {cp.candidate.firstName} {cp.candidate.lastName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{cp.candidate.email}</td>
                <td className="px-4 py-3 text-gray-600">{cp.candidate.seniority ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {STAGE_LABELS[cp.stage]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{fitCell(cp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <AddCandidateToPositionModal
          positionId={positionId}
          existingCandidateIds={existingCandidateIds}
          onCandidateAdded={handleCandidateAdded}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
