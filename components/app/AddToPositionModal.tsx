'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Position {
  id: string
  title: string
  client: string
}

interface AddToPositionModalProps {
  candidateId: string
  onClose: () => void
}

export function AddToPositionModal({ candidateId, onClose }: AddToPositionModalProps) {
  const router = useRouter()
  const [positions, setPositions] = useState<Position[]>([])
  const [positionId, setPositionId] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/positions?status=OPEN')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPositions(data)
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!positionId) {
      setError('Please select a position.')
      return
    }
    setLoading(true)
    setError('')

    const res = await fetch('/api/candidate-positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, positionId, notes: notes || null }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add to Position</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="positionId">Position *</Label>
            <Select
              id="positionId"
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              required
            >
              <option value="">— Select a position —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} – {p.client}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              className="min-h-[80px]"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding…' : 'Add to Position'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
