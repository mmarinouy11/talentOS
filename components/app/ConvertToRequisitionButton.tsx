'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ConvertToRequisitionButton({ positionId, positionTitle }: { positionId: string; positionTitle: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [headcount, setHeadcount] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hc = parseInt(headcount, 10)
  const valid = Number.isInteger(hc) && hc >= 1

  async function confirm() {
    if (!valid) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/positions/${positionId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headcount: hc }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Conversion failed')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Conversion failed — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Convert to requisition</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Convert to requisition</h2>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-medium text-gray-700">{positionTitle}</span> will become an open requisition.
                Candidates, interviews and history stay as they are.
              </p>
            </div>
            <div>
              <Label htmlFor="convert-headcount">Headcount *</Label>
              <Input
                id="convert-headcount"
                type="number"
                min={1}
                step={1}
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value)}
                autoFocus
              />
              {!valid && <p className="text-xs text-red-600 mt-1">Enter a whole number of at least 1.</p>}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={confirm} disabled={!valid || saving}>{saving ? 'Converting…' : 'Convert'}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
