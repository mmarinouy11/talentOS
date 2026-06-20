'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
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

function getAllowedNextStages(current: Stage): Stage[] {
  const terminalStages: Stage[] = ['HIRED', 'REJECTED']
  if (terminalStages.includes(current)) return []

  const idx = STAGE_ORDER.indexOf(current)
  const forward = STAGE_ORDER.slice(idx + 1)
  return [...forward, 'REJECTED']
}

interface MoveStageModalProps {
  candidatePositionId: string
  currentStage: Stage
  onClose: () => void
}

export function MoveStageModal({ candidatePositionId, currentStage, onClose }: MoveStageModalProps) {
  const router = useRouter()
  const allowed = getAllowedNextStages(currentStage)
  const [newStage, setNewStage] = useState<Stage>(allowed[0] ?? currentStage)
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

  if (allowed.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Move Stage</h2>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <p className="text-sm text-gray-500">This candidate is already in a terminal stage ({STAGE_LABELS[currentStage]}).</p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    )
  }

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
          <div>
            <Label htmlFor="newStage">New Stage *</Label>
            <Select
              id="newStage"
              value={newStage}
              onChange={(e) => setNewStage(e.target.value as Stage)}
              required
            >
              {allowed.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </Select>
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
            <Button type="submit" disabled={loading}>
              {loading ? 'Moving…' : 'Move Stage'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
