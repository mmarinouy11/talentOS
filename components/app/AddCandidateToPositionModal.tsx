'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SeniorityBadge } from './SeniorityBadge'
import { LinkedInImportFlow, type NewCandidatePosition } from './LinkedInImportFlow'
import type { Seniority } from '@prisma/client'
import type { ConfirmResult } from '@/app/api/candidates/bulk-import/confirm/route'

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string
  seniority: Seniority | null
}

interface Props {
  positionId: string
  existingCandidateIds: Set<string>
  onCandidateAdded: (newRow: NewCandidatePosition) => void
  onClose: () => void
}

type Tab = 'search' | 'import'

export function AddCandidateToPositionModal({ positionId, existingCandidateIds, onCandidateAdded, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('search')

  // Search tab state
  const [filter, setFilter] = useState('')
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/candidates')
      .then((r) => r.json())
      .then((data) => setAllCandidates(data))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    if (!q) return allCandidates
    return allCandidates.filter(
      (c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    )
  }, [allCandidates, filter])

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
      const cp = await res.json()
      setAdded((prev) => new Set([...prev, candidateId]))
      onCandidateAdded({
        id: cp.id,
        stage: 'APPLIED',
        fitScore: null,
        candidate: cp.candidate,
      })
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to add candidate')
    }
  }

  const inPosition = (candidateId: string) =>
    existingCandidateIds.has(candidateId) || added.has(candidateId)

  function handleImportDone(result: ConfirmResult, newPositions?: NewCandidatePosition[]) {
    // Add each new candidate-position to the panel
    if (newPositions) {
      for (const cp of newPositions) {
        onCandidateAdded(cp)
      }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Add Candidate to Position</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 shrink-0 px-6">
          <button
            className={`py-3 text-sm font-medium border-b-2 mr-6 transition-colors ${
              tab === 'search'
                ? 'border-[#8DF000] text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('search')}
          >
            Search Existing
          </button>
          <button
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'import'
                ? 'border-[#8DF000] text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab('import')}
          >
            Import from LinkedIn
          </button>
        </div>

        {/* Search tab */}
        {tab === 'search' && (
          <>
            <div className="px-6 pt-4 shrink-0">
              <Input
                autoFocus
                placeholder="Filter by name or email…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3">
              {loading ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading candidates…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No candidates found.</p>
              ) : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {filtered.map((c) => {
                    const already = inPosition(c.id)
                    return (
                      <div key={c.id} className="flex items-center justify-between px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {c.firstName} {c.lastName}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{c.email}</p>
                        </div>
                        <div className="flex items-center gap-3 ml-4 shrink-0">
                          {c.seniority && <SeniorityBadge seniority={c.seniority} />}
                          {already ? (
                            <span className="text-xs text-green-600 font-medium w-14 text-right">In position ✓</span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleAdd(c.id)}
                              disabled={adding === c.id}
                              className="w-14"
                            >
                              {adding === c.id ? '…' : 'Add'}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end">
              <Button variant="outline" onClick={onClose}>Done</Button>
            </div>
          </>
        )}

        {/* Import tab */}
        {tab === 'import' && (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <LinkedInImportFlow
              positionId={positionId}
              onDone={handleImportDone}
              onCancel={onClose}
              compact
            />
          </div>
        )}
      </div>
    </div>
  )
}
