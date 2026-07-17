'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { Stage } from '@prisma/client'

const STAGE_ORDER: Stage[] = [
  'APPLIED',
  'SCREENING',
  'TECHNICAL_INTERVIEW',
  'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW',
  'OFFER',
  'HIRED',
]

const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

function getNextStages(current: Stage): { primary: Stage[]; other: Stage[] } {
  const currentIdx = STAGE_ORDER.indexOf(current)
  const allStages: Stage[] = [...STAGE_ORDER, 'REJECTED']

  // Natural next: up to 2 stages forward (excluding current)
  const primary = STAGE_ORDER.slice(currentIdx + 1, currentIdx + 3)

  // Everything else except the current stage
  const other = allStages.filter((s) => s !== current && !primary.includes(s))

  return { primary, other }
}

interface MoveStageModalProps {
  candidatePositionId: string
  currentStage: Stage
  onClose: () => void
}

export function MoveStageModal({ candidatePositionId, currentStage, onClose }: MoveStageModalProps) {
  const router = useRouter()
  const { primary, other } = getNextStages(currentStage)
  const defaultStage = primary[0] ?? other[0] ?? currentStage
  const [newStage, setNewStage] = useState<Stage>(defaultStage)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch(`/api/candidate-positions/${candidatePositionId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStage, notes: notes || null }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong.')
      return
    }

    router.refresh()
    onClose()
  }

  const StageOption = ({ stage, dim = false }: { stage: Stage; dim?: boolean }) => (
    <label
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
        newStage === stage
          ? 'border-[#8DF000] bg-[#8DF000]/10'
          : dim
          ? 'border-gray-100 bg-gray-50 hover:bg-gray-100'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <input
        type="radio"
        name="newStage"
        value={stage}
        checked={newStage === stage}
        onChange={() => setNewStage(stage)}
        className="sr-only"
      />
      <span className={`text-sm font-medium ${dim ? 'text-gray-500' : 'text-gray-800'} ${stage === 'REJECTED' ? 'text-red-600' : ''}`}>
        {STAGE_LABELS[stage]}
      </span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Move Stage</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <p className="text-sm text-gray-500">
          Current stage: <span className="font-medium text-gray-900">{STAGE_LABELS[currentStage]}</span>
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            {primary.length > 0 && (
              <>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Next Steps</p>
                {primary.map((s) => <StageOption key={s} stage={s} />)}
              </>
            )}

            {other.length > 0 && (
              <>
                <div className={`flex items-center gap-2 ${primary.length > 0 ? 'pt-2' : ''}`}>
                  <div className="flex-1 border-t border-gray-100" />
                  <p className="text-xs text-gray-400">Other stages</p>
                  <div className="flex-1 border-t border-gray-100" />
                </div>
                {other.map((s) => <StageOption key={s} stage={s} dim />)}
              </>
            )}
          </div>

          <div>
            <Label htmlFor="moveNotes">Notes</Label>
            <Textarea
              id="moveNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              className="min-h-[80px]"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || newStage === currentStage}>
              {loading ? 'Moving…' : 'Move Stage'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
