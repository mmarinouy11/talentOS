'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AddToPositionModal } from './AddToPositionModal'
import { MoveStageModal } from './MoveStageModal'
import { StageBadge } from './StageBadge'
import type { Stage } from '@prisma/client'

interface CandidatePosition {
  id: string
  stage: Stage
  stageEnteredAt: string
  notes: string | null
  position: { id: string; title: string; client: string }
}

interface CandidateDetailClientProps {
  candidateId: string
  candidatePositions: CandidatePosition[]
}

export function CandidateDetailClient({ candidateId, candidatePositions }: CandidateDetailClientProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [moveTarget, setMoveTarget] = useState<{ id: string; stage: Stage } | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900">Positions ({candidatePositions.length})</h2>
        <Button size="sm" onClick={() => setShowAddModal(true)}>Add to Position</Button>
      </div>

      {candidatePositions.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">No positions yet.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {candidatePositions.map((cp) => (
            <Link
              key={cp.id}
              href={`/positions/${cp.position.id}/candidates/${cp.id}`}
              className="py-3 flex items-center justify-between hover:bg-gray-50 -mx-1 px-1 rounded-lg cursor-pointer transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{cp.position.title}</p>
                <p className="text-xs text-gray-500">{cp.position.client}</p>
              </div>
              <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <StageBadge stage={cp.stage} />
                {!['HIRED', 'REJECTED'].includes(cp.stage) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.preventDefault(); setMoveTarget({ id: cp.id, stage: cp.stage }) }}
                  >
                    Move Stage
                  </Button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddToPositionModal candidateId={candidateId} onClose={() => setShowAddModal(false)} />
      )}

      {moveTarget && (
        <MoveStageModal
          candidatePositionId={moveTarget.id}
          currentStage={moveTarget.stage}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </div>
  )
}
