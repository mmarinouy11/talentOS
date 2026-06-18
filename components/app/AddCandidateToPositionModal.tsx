'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SeniorityBadge } from './SeniorityBadge'
import type { Seniority } from '@prisma/client'

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string
  seniority: Seniority | null
}

interface Props {
  positionId: string
  onClose: () => void
}

export function AddCandidateToPositionModal({ positionId, onClose }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!search.trim()) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/candidates?search=${encodeURIComponent(search)}`)
        const data = await res.json()
        setResults(data)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [search])

  async function handleAdd(candidateId: string) {
    setAdding(candidateId)
    setError('')
    const res = await fetch('/api/candidate-positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId, positionId }),
    })
    setAdding(null)
    if (res.ok) {
      setAdded((prev) => new Set([...prev, candidateId]))
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to add candidate')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Add Candidate to Position</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          <Input
            autoFocus
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {loading && (
            <p className="text-sm text-gray-400 text-center py-4">Searching…</p>
          )}

          {!loading && search && results.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No candidates found.</p>
          )}

          {!loading && results.length > 0 && (
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto rounded-lg border border-gray-200">
              {results.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.firstName} {c.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{c.email}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    {c.seniority && <SeniorityBadge seniority={c.seniority} />}
                    {added.has(c.id) ? (
                      <span className="text-xs text-green-600 font-medium">Added ✓</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleAdd(c.id)}
                        disabled={adding === c.id}
                      >
                        {adding === c.id ? '…' : 'Add'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!search && (
            <p className="text-sm text-gray-400 text-center py-4">Type to search candidates</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}
