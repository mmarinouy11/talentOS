'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface VendorFormProps {
  mode: 'create' | 'edit'
  defaultValues?: {
    id?: string
    name?: string
    pocName?: string | null
    pocEmail?: string | null
    phone?: string | null
    notes?: string | null
    active?: boolean
    type?: 'RECRUITING_PARTNER' | 'REFERRAL_NETWORK'
  }
}

export function VendorForm({ mode, defaultValues = {} }: VendorFormProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(defaultValues.name ?? '')
  const [pocName, setPocName] = useState(defaultValues.pocName ?? '')
  const [pocEmail, setPocEmail] = useState(defaultValues.pocEmail ?? '')
  const [phone, setPhone] = useState(defaultValues.phone ?? '')
  const [notes, setNotes] = useState(defaultValues.notes ?? '')
  const [active, setActive] = useState(defaultValues.active ?? true)
  const [type, setType] = useState<'RECRUITING_PARTNER' | 'REFERRAL_NETWORK'>(defaultValues.type ?? 'RECRUITING_PARTNER')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const payload = {
      name,
      pocName: pocName || null,
      pocEmail: pocEmail || null,
      phone: phone || null,
      notes: notes || null,
      active,
      type,
    }

    const url = mode === 'edit' ? `/api/vendors/${defaultValues.id}` : '/api/vendors'
    const method = mode === 'edit' ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      const msg =
        data.error?.fieldErrors
          ? Object.values(data.error.fieldErrors as Record<string, string[]>).flat()[0]
          : typeof data.error === 'string'
          ? data.error
          : 'Something went wrong.'
      setError(msg)
      return
    }

    router.push('/vendors')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="type">Partner Type</Label>
          <div className="flex gap-3 mt-1">
            {(['RECRUITING_PARTNER', 'REFERRAL_NETWORK'] as const).map((t) => (
              <label key={t} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-colors ${type === t ? 'border-[#8DF000] bg-[#F5FBE8]' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="type"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                  className="accent-[#8DF000]"
                />
                <span className="text-sm font-medium text-gray-700">
                  {t === 'RECRUITING_PARTNER' ? 'Recruiting Partner' : 'Referral Network'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <Label htmlFor="name">Partner Name *</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. TechStaff Partners"
          />
        </div>

        <div>
          <Label htmlFor="pocName">Point of Contact Name</Label>
          <Input
            id="pocName"
            value={pocName}
            onChange={(e) => setPocName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="pocEmail">Point of Contact Email</Label>
          <Input
            id="pocEmail"
            type="email"
            value={pocEmail}
            onChange={(e) => setPocEmail(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-[#8DF000]"
            />
            <span className="text-sm font-medium text-gray-700">Active partner</span>
          </label>
        </div>

        <div className="col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes about this partner…"
            className="min-h-[100px]"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Partner'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
