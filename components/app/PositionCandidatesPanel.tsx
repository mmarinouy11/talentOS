'use client'

import { useState } from 'react'
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

export function PositionCandidatesPanel({ positionId, candidatePositions, activeCandidates }: Props) {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-900">
            Candidates ({candidatePositions.length})
          </span>
          <span className="ml-4 text-sm text-gray-500">{activeCandidates} active</span>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}>Add Candidate</Button>
      </div>

      {candidatePositions.length === 0 ? (
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
            {candidatePositions.map((cp) => (
              <tr
                key={cp.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => window.location.href = `/positions/${positionId}/candidates/${cp.id}`}
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
                <td className="px-4 py-3 text-right">
                  {cp.fitScore != null
                    ? <span className={`font-medium ${scoreColor(cp.fitScore)}`}>{Math.round(cp.fitScore)}</span>
                    : <span className="text-gray-400">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <AddCandidateToPositionModal
          positionId={positionId}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
