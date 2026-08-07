'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

type Seniority = 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL'

interface TalentCandidate {
  id: string
  firstName: string
  lastName: string
  country: string | null
  skills: string[]
  seniority: Seniority | null
  yearsOfExperience: number | null
  matchingSkills: string[]
  matchCount: number
  score?: number
  reason?: string
  scoring?: boolean
}

interface AddedCP {
  id: string
  candidateId: string
  candidate: { id: string; firstName: string; lastName: string; email: string; country: string | null; seniority: string | null }
}

interface TalentSearchModalProps {
  positionId: string
  positionTitle: string
  onClose: () => void
  onAdded: (added: AddedCP[]) => void
}

const SENIORITY_LABEL: Record<Seniority, string> = {
  JUNIOR: 'Junior',
  MID: 'Mid',
  SENIOR: 'Senior',
  STAFF: 'Staff',
  PRINCIPAL: 'Principal',
}

export function TalentSearchModal({ positionId, positionTitle, onClose, onAdded }: TalentSearchModalProps) {
  const [candidates, setCandidates] = useState<TalentCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/positions/${positionId}/talent-search`, { method: 'POST' })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      const initial: TalentCandidate[] = (data.candidates ?? []).map((c: TalentCandidate) => ({
        ...c,
        scoring: true,
      }))
      setCandidates(initial)
      setTotal(data.total ?? initial.length)
      setLoading(false)

      if (initial.length === 0) return

      // Step 2: quick Claude scoring
      setScoring(true)
      const scoreRes = await fetch(`/api/positions/${positionId}/talent-search/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: initial.map((c) => ({
            id: c.id,
            skills: c.skills,
            seniority: c.seniority,
            yearsOfExperience: c.yearsOfExperience,
          })),
        }),
      })

      if (scoreRes.ok) {
        const scoreData = await scoreRes.json()
        const scoreMap = new Map<string, { score: number; reason: string }>(
          (scoreData.scores ?? []).map((s: { candidateId: string; score: number; reason: string }) => [
            s.candidateId,
            { score: s.score, reason: s.reason },
          ])
        )
        setCandidates((prev) =>
          [...prev]
            .map((c) => {
              const s = scoreMap.get(c.id)
              return s ? { ...c, score: s.score, reason: s.reason, scoring: false } : { ...c, scoring: false }
            })
            .sort((a, b) => (b.score ?? b.matchCount) - (a.score ?? a.matchCount))
        )
      } else {
        setCandidates((prev) => prev.map((c) => ({ ...c, scoring: false })))
      }
      setScoring(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
      setScoring(false)
    }
  }, [positionId])

  useEffect(() => { runSearch() }, [runSearch])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === candidates.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(candidates.map((c) => c.id)))
    }
  }

  async function handleAdd() {
    if (selected.size === 0) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(`/api/positions/${positionId}/talent-search/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: [...selected] }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to add candidates')
      }
      const data = await res.json()
      onAdded(data.added ?? [])
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add candidates')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Find Candidates</h2>
          <p className="text-sm text-gray-500 mt-0.5">Matching internal profiles for <span className="font-medium text-gray-700">{positionTitle}</span></p>
        </div>

        {/* Status bar */}
        <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-100 shrink-0 flex items-center justify-between">
          {loading ? (
            <span className="text-sm text-gray-500">Searching database…</span>
          ) : (
            <span className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{candidates.length}</span> candidates found
              {total > candidates.length && <span className="text-gray-400"> (showing top {candidates.length} of {total})</span>}
            </span>
          )}
          {scoring && !loading && (
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#8CF000] animate-pulse" />
              Analyzing candidates…
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-block h-6 w-6 rounded-full border-2 border-gray-200 border-t-[#8CF000] animate-spin mb-3" />
              <p className="text-sm text-gray-400">Searching for matching candidates…</p>
            </div>
          ) : error ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <Button variant="outline" onClick={runSearch} className="mt-4">Retry</Button>
            </div>
          ) : candidates.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-500">No matching candidates found in the database.</p>
              <p className="text-xs text-gray-400 mt-1">Candidates must have overlapping skills and not already be in an active pipeline.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-[2px] border-b-[#8CF000] bg-gray-50">
                  <th className="py-2.5 pl-4 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === candidates.length && candidates.length > 0}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 accent-black"
                    />
                  </th>
                  <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</th>
                  <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Matching Skills</th>
                  <th className="py-2.5 px-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {candidates.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => toggleSelect(c.id)}
                    className={`cursor-pointer hover:bg-[#F5F0EB] transition-colors ${selected.has(c.id) ? 'bg-[#F5F0EB]' : ''}`}
                  >
                    <td className="py-3 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 accent-black"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-gray-900">{c.firstName} {c.lastName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {c.seniority ? SENIORITY_LABEL[c.seniority] : null}
                        {c.seniority && c.country ? ' · ' : ''}
                        {c.country ?? ''}
                        {c.yearsOfExperience ? ` · ${c.yearsOfExperience}y exp` : ''}
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {c.matchingSkills.slice(0, 4).map((s) => (
                          <span key={s} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{s}</span>
                        ))}
                        {c.matchingSkills.length > 4 && (
                          <span className="text-xs text-gray-400">+{c.matchingSkills.length - 4} more</span>
                        )}
                      </div>
                      {c.reason && !c.scoring && (
                        <p className="text-xs text-gray-400 mt-1 leading-snug line-clamp-1">{c.reason}</p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {c.scoring ? (
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-gray-200 border-t-[#8CF000] animate-spin" />
                      ) : c.score !== undefined ? (
                        <span className={`text-sm font-semibold ${c.score >= 70 ? 'text-green-700' : c.score >= 50 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {c.score}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <p className="text-sm text-gray-500">
            {selected.size > 0 ? `${selected.size} selected` : 'Select candidates to add'}
          </p>
          {error && adding && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={adding}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={selected.size === 0 || adding}
            >
              {adding ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''} selected`.trim()}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
