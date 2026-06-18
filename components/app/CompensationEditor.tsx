'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  candidatePositionId: string
  desiredCompensation: number | null
  minimumCompensation: number | null
  internalCostBudget: number | null
}

function fmt(n: number | null) {
  return n != null ? `$${n.toLocaleString()}/hr` : '—'
}

export function CompensationEditor({
  candidatePositionId,
  desiredCompensation: initialDesired,
  minimumCompensation: initialMin,
  internalCostBudget,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [desired, setDesired] = useState<number | null>(initialDesired)
  const [minimum, setMinimum] = useState<number | null>(initialMin)
  const [desiredInput, setDesiredInput] = useState(
    initialDesired != null ? String(initialDesired) : ''
  )
  const [minInput, setMinInput] = useState(initialMin != null ? String(initialMin) : '')

  const outOfRange =
    minimum != null && internalCostBudget != null ? minimum > internalCostBudget : false

  async function save() {
    setSaving(true)
    setError('')
    const d = desiredInput !== '' ? parseFloat(desiredInput) : null
    const m = minInput !== '' ? parseFloat(minInput) : null
    try {
      const res = await fetch(`/api/candidate-positions/${candidatePositionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desiredCompensation: d, minimumCompensation: m }),
      })
      if (!res.ok) {
        setError('Failed to save')
        return
      }
      setDesired(d)
      setMinimum(m)
      setEditing(false)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-900">Compensation</h2>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>

      {minimum != null && internalCostBudget != null && (
        outOfRange ? (
          <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span className="text-red-600">⚠</span>
            <p className="text-sm text-red-700 font-medium">
              This candidate&apos;s minimum expectation ({fmt(minimum)}) exceeds the position budget ({fmt(internalCostBudget)})
            </p>
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <span className="text-green-600">✓</span>
            <p className="text-sm text-green-700 font-medium">Within budget</p>
          </div>
        )
      )}

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor="desiredComp">Desired Compensation ($/hour)</Label>
            <Input
              id="desiredComp"
              type="number"
              min={0}
              value={desiredInput}
              onChange={(e) => setDesiredInput(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="minComp">Minimum Acceptable Compensation ($/hour)</Label>
            <Input
              id="minComp"
              type="number"
              min={0}
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setError('')
                setDesiredInput(desired != null ? String(desired) : '')
                setMinInput(minimum != null ? String(minimum) : '')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Desired</p>
            <p className="text-gray-900 mt-0.5">{fmt(desired)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Minimum Acceptable</p>
            <p className="text-gray-900 mt-0.5">{fmt(minimum)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Internal Budget</p>
            <p className="text-gray-900 mt-0.5">{fmt(internalCostBudget)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
