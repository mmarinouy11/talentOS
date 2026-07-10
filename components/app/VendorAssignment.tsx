'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface Vendor {
  id: string
  name: string
  pocName: string | null
  pocEmail: string | null
  portalToken: string | null
}

interface VendorAssignmentProps {
  positionId: string
  initialVendors: Vendor[]
}

export function VendorAssignment({ positionId, initialVendors }: VendorAssignmentProps) {
  const [assigned, setAssigned] = useState<Vendor[]>(initialVendors)
  const [allVendors, setAllVendors] = useState<Vendor[]>([])
  const [saving, setSaving] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/vendors?active=true')
      .then((r) => r.json())
      .then(setAllVendors)
      .catch(() => {})
  }, [])

  const assignedIds = new Set(assigned.map((v) => v.id))

  const unassigned = allVendors.filter(
    (v) => !assignedIds.has(v.id) && v.name.toLowerCase().includes(search.toLowerCase())
  )

  async function save(newIds: string[]) {
    setSaving(true)
    setEmailError(null)
    setEmailSuccess(null)
    try {
      const res = await fetch(`/api/positions/${positionId}/vendors`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorIds: newIds }),
      })
      if (res.ok) {
        const data = await res.json()
        setAssigned(data.vendors)
        if (data.emailError) setEmailError(data.emailError)
        if (data.emailSuccesses?.length > 0) {
          const names = (data.emailSuccesses as string[]).join(', ')
          setEmailSuccess(`Vendor${data.emailSuccesses.length > 1 ? 's' : ''} assigned. A notification email has been sent to ${names}.`)
        }
      }
    } finally {
      setSaving(false)
    }
  }

  function add(vendor: Vendor) {
    const next = [...assigned, vendor]
    setSearch('')
    save(next.map((v) => v.id))
  }

  function remove(vendorId: string) {
    save(assigned.filter((v) => v.id !== vendorId).map((v) => v.id))
  }

  return (
    <div className="space-y-3">
      {emailSuccess && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {emailSuccess}
        </div>
      )}
      {emailError && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
          {emailError.split(' | ').map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
        </div>
      )}

      {assigned.length > 0 ? (
        <div className="space-y-2">
          {assigned.map((v) => (
            <div key={v.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{v.name}</p>
                {v.pocName && <p className="text-xs text-gray-500">{v.pocName}{v.pocEmail ? ` · ${v.pocEmail}` : ''}</p>}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => remove(v.id)}
                disabled={saving}
                className="text-xs px-2 py-1 h-auto text-red-600 border-red-200 hover:bg-red-50"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No vendors assigned yet.</p>
      )}

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors to assign…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && unassigned.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {unassigned.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => add(v)}
                disabled={saving}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex flex-col"
              >
                <span className="font-medium text-gray-900">{v.name}</span>
                {v.pocEmail && <span className="text-xs text-gray-500">{v.pocEmail}</span>}
              </button>
            ))}
          </div>
        )}
        {search && unassigned.length === 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
            No matching vendors found.
          </div>
        )}
      </div>
    </div>
  )
}
