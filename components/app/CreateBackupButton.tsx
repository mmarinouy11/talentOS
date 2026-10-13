'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface RecruiterOption { id: string; name: string | null; email: string }

export function CreateBackupButton({
  positionId,
  positionTitle,
  recruiterId,
  recruiters,
}: {
  positionId: string
  positionTitle: string
  recruiterId: string
  recruiters: RecruiterOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(`${positionTitle} — Backup`)
  const [leadId, setLeadId] = useState(recruiterId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const valid = title.trim().length > 0 && leadId !== ''

  async function create() {
    if (!valid) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/positions/${positionId}/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), recruiterId: leadId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Could not create backup'); return }
      router.push(`/positions/${body.id}`)
    } catch {
      setError('Could not create backup — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>Create proactive backup</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create proactive backup</h2>
              <p className="text-sm text-gray-500 mt-1">
                A new proactive position with the same JD and settings, to source backup profiles.
                Candidates and partners are not copied.
              </p>
            </div>
            <div>
              <Label htmlFor="backup-title">Title *</Label>
              <Input id="backup-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="backup-recruiter">Lead recruiter *</Label>
              <Select id="backup-recruiter" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">— Select recruiter —</option>
                {recruiters.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                ))}
              </Select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={create} disabled={!valid || saving}>{saving ? 'Creating…' : 'Create backup'}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
