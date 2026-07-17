'use client'

import { useState } from 'react'
import { StageBadge } from '@/components/app/StageBadge'
import { MoveStageModal } from '@/components/app/MoveStageModal'
import { Button } from '@/components/ui/button'
import type { Stage } from '@prisma/client'

interface Props {
  candidatePositionId: string
  stage: Stage
}

export function CandidateInPositionHeader({ candidatePositionId, stage }: Props) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <StageBadge stage={stage} />
      <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
        Move Stage
      </Button>
      {showModal && (
        <MoveStageModal
          candidatePositionId={candidatePositionId}
          currentStage={stage}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
