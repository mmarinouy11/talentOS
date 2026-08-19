'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Stage } from '@prisma/client'

const ACTIVE_STAGES: Stage[] = [
  'APPLIED',
  'SCREENING',
  'TECHNICAL_INTERVIEW',
  'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW',
  'OFFER',
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
  WITHDRAWN: 'On Hold',
}

type SelectionValue = Stage | 'DROPPED'

interface MoveStageModalProps {
  candidatePositionId: string
  currentStage: Stage
  onClose: () => void
}

export function MoveStageModal({ candidatePositionId, currentStage, onClose }: MoveStageModalProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<SelectionValue>(
    ACTIVE_STAGES.includes(currentStage)
      ? (ACTIVE_STAGES[ACTIVE_STAGES.indexOf(currentStage) + 1] ?? 'HIRED')
      : 'HIRED'
  )
  const [notes, setNotes] = useState('')
  const [startDate, setStartDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (selected === 'HIRED' && !startDate) {
      setError('Please enter the expected start date before marking as Hired.')
      setLoading(false)
      return
    }

    const body = {
      newStage: selected === 'DROPPED' ? 'WITHDRAWN' : selected,
      notes: notes || null,
      startDate: selected === 'HIRED' && startDate ? startDate : null,
    }

    const res = await fetch(`/api/candidate-positions/${candidatePositionId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

  const Option = ({
    value,
    label,
    dim = false,
    colorClass,
  }: {
    value: SelectionValue
    label: string
    dim?: boolean
    colorClass?: string
  }) => (
    <label
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
        selected === value
          ? 'border-[#8CF000] bg-[#8CF000]/10'
          : dim
          ? 'border-gray-100 bg-gray-50 hover:bg-gray-100'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <input
        type="radio"
        name="selection"
        value={value}
        checked={selected === value}
        onChange={() => setSelected(value)}
        className="sr-only"
      />
      <span className={`text-sm font-medium ${colorClass ?? (dim ? 'text-gray-500' : 'text-gray-800')}`}>
        {label}
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
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Pipeline</p>
            {ACTIVE_STAGES.map((s) => (
              <Option key={s} value={s} label={STAGE_LABELS[s]} dim={ACTIVE_STAGES.indexOf(s) < ACTIVE_STAGES.indexOf(currentStage)} />
            ))}

            <div className="flex items-center gap-2 pt-2">
              <div className="flex-1 border-t border-gray-100" />
              <p className="text-xs text-gray-400">Final states</p>
              <div className="flex-1 border-t border-gray-100" />
            </div>

            <Option value="HIRED" label="Hired" colorClass="text-green-700" />
            <Option value="WITHDRAWN" label="On Hold" colorClass="text-amber-600" />
            <Option value="DROPPED" label="Dropped" colorClass="text-gray-500" />
            <Option value="REJECTED" label="Rejected" colorClass="text-red-600" />
          </div>

          {selected === 'HIRED' && (
            <div>
              <Label htmlFor="startDate">Expected Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">When is this candidate expected to join?</p>
            </div>
          )}

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
            <Button type="submit" disabled={loading || (selected === 'HIRED' && !startDate)}>
              {loading ? 'Saving…' : selected === 'WITHDRAWN' ? 'Put On Hold' : selected === 'DROPPED' ? 'Mark as Dropped' : 'Move Stage'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
