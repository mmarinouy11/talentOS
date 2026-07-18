'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface Position {
  id: string
  title: string
  client: string
  status: string
}

export function VendorPositionAssignment({ vendorId }: { vendorId: string }) {
  const [assigned, setAssigned] = useState<Position[]>([])
  const [available, setAvailable] = useState<Position[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/vendors/${vendorId}/positions`)
    if (res.ok) {
      const d = await res.json()
      setAssigned(d.assigned)
      setAvailable(d.available)
    }
  }

  useEffect(() => { load() }, [vendorId])

  async function assign(position: Position) {
    setSaving(true)
    setNotification(null)
    try {
      const res = await fetch(`/api/vendors/${vendorId}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: position.id }),
      })
      if (res.ok) {
        const d = await res.json()
        await load()
        setSearch('')
        setNotification(d.emailSuccess
          ? 'Partner notified by email about this change.'
          : 'Position assigned. (Partner not emailed — check email/portal settings.)')
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove(positionId: string) {
    setSaving(true)
    setNotification(null)
    try {
      const res = await fetch(`/api/vendors/${vendorId}/positions/${positionId}`, { method: 'DELETE' })
      if (res.ok) {
        const d = await res.json()
        await load()
        setNotification(d.emailSuccess
          ? 'Partner notified by email about this change.'
          : 'Position removed. (Partner not emailed — check email/portal settings.)')
      }
    } finally {
      setSaving(false)
    }
  }

  const filtered = available.filter((p) =>
    !search ||
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.client.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-3">
      {notification && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {notification}
        </div>
      )}

      {assigned.length > 0 ? (
        <div className="space-y-2">
          {assigned.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{p.title}</p>
                <p className="text-xs text-gray-500">{p.client}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {p.status}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => remove(p.id)}
                  disabled={saving}
                  className="text-xs px-2 py-1 h-auto text-red-600 border-red-200 hover:bg-red-50"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No positions assigned yet.</p>
      )}

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search open positions to assign…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && filtered.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => assign(p)}
                disabled={saving}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex flex-col"
              >
                <span className="font-medium text-gray-900">{p.title}</span>
                <span className="text-xs text-gray-500">{p.client}</span>
              </button>
            ))}
          </div>
        )}
        {search && filtered.length === 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
            No matching open positions found.
          </div>
        )}
      </div>
    </div>
  )
}
