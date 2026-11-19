'use client'

import { useState, useEffect, useCallback } from 'react'
import { RedeployBadge, LwdChip } from './RedeployBadge'
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
  redeploy?: { lwd: string | null } | null
  autoScore?: boolean
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

const SCORE_BATCH = 15

interface AutoScoring { strongCount: number; strongScore: number; autoMax: number }
const DEFAULT_AUTO: AutoScoring = { strongCount: 5, strongScore: 70, autoMax: 45 }

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
  // Candidates (prefilter order) still without a real score; scored 15 at a time on request
  const [pending, setPending] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  type ScoreResponse = { scores: { candidateId: string; score: number; reason: string; cached: boolean }[]; pending: string[]; failed: string[] }

  // Real fit scores: cached ones come back free; at most `limit` (≤15) new ones are computed per request
  const requestScores = useCallback(async (ids: string[], limit: number): Promise<ScoreResponse> => {
    const res = await fetch(`/api/positions/${positionId}/talent-search/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateIds: ids, limit }),
    })
    if (!res.ok) throw new Error('Scoring failed')
    return res.json() as Promise<ScoreResponse>
  }, [positionId])

  const applyScores = useCallback((data: ScoreResponse) => {
    const scoreMap = new Map(data.scores.map((x) => [x.candidateId, x]))
    setCandidates((prev) => prev.map((c) => {
      const x = scoreMap.get(c.id)
      return x ? { ...c, score: x.score, reason: x.reason, scoring: false } : c
    }))
    return scoreMap
  }, [])

  // Still unscored, in server (prefilter) order: auto-eligible first
  const unscoredIds = (list: TalentCandidate[], done: Set<string>) => list.filter((c) => !done.has(c.id)).map((c) => c.id)

  const runAutoScoring = useCallback(async (list: TalentCandidate[], cfg: AutoScoring) => {
    setScoring(true)
    const done = new Set<string>()
    const failed = new Set<string>()
    try {
      const eligible = list.filter((c) => c.autoScore)
      const rest = list.filter((c) => !c.autoScore)
      // Non-eligible: cached scores only (free)
      if (rest.length > 0) {
        const r = await requestScores(rest.map((c) => c.id), 0)
        applyScores(r).forEach((_, id) => done.add(id))
      }
      // Eligible: 15 at a time; continue while a batch of new scores is strong, up to autoMax computed
      let computed = 0
      let first = true
      while (true) {
        const ids = eligible.map((c) => c.id).filter((id) => !done.has(id) && !failed.has(id))
        if (ids.length === 0) break
        const limit = Math.min(SCORE_BATCH, Math.max(0, cfg.autoMax - computed))
        if (!first && limit === 0) break
        const toMark = new Set(ids.slice(0, limit))
        setCandidates((prev) => prev.map((c) => (toMark.has(c.id) ? { ...c, scoring: true } : c)))
        const r = await requestScores(ids, limit)
        const map = applyScores(r)
        map.forEach((_, id) => done.add(id))
        r.failed.forEach((id) => failed.add(id))
        setCandidates((prev) => prev.map((c) => (c.scoring ? { ...c, scoring: false } : c)))
        const fresh = r.scores.filter((x) => !x.cached)
        computed += fresh.length
        first = false
        const strong = fresh.filter((x) => x.score >= cfg.strongScore).length
        if (fresh.length === 0 || strong < cfg.strongCount || computed >= cfg.autoMax) break
      }
    } catch {
      setCandidates((prev) => prev.map((c) => ({ ...c, scoring: false })))
    } finally {
      setPending(unscoredIds(list, done))
      setScoring(false)
    }
  }, [requestScores, applyScores])

  // "Score 15 more": next unscored in prefilter order (eligible first, then the rest)
  const scoreMore = useCallback(async () => {
    if (pending.length === 0) return
    setScoring(true)
    const toMark = new Set(pending.slice(0, SCORE_BATCH))
    setCandidates((prev) => prev.map((c) => (toMark.has(c.id) ? { ...c, scoring: true } : c)))
    try {
      const r = await requestScores(pending, SCORE_BATCH)
      const map = applyScores(r)
      const failed = new Set(r.failed)
      setPending(pending.filter((id) => !map.has(id) && !failed.has(id)))
    } catch {
      // keep pending as is
    } finally {
      setCandidates((prev) => prev.map((c) => (c.scoring ? { ...c, scoring: false } : c)))
      setScoring(false)
    }
  }, [pending, requestScores, applyScores])

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/positions/${positionId}/talent-search`, { method: 'POST' })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      const initial: TalentCandidate[] = data.candidates ?? []
      setCandidates(initial)
      setTotal(data.total ?? initial.length)
      setLoading(false)

      if (initial.length === 0) return
      await runAutoScoring(initial, { ...DEFAULT_AUTO, ...(data.autoScoring ?? {}) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
      setScoring(false)
    }
  }, [positionId, runAutoScoring])

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

  // Redeployment rows: lime left border + badge + LWD chip. Highlighted only, never prioritized.
  const renderRow = (c: TalentCandidate) => (
                  <tr
                    key={c.id}
                    onClick={() => toggleSelect(c.id)}
                    className={`cursor-pointer hover:bg-[#F5F0EB] transition-colors ${selected.has(c.id) ? 'bg-[#F5F0EB]' : ''}`}
                  >
                    <td className={`py-3 pl-4 pr-2 ${c.redeploy ? 'border-l-4 border-l-[#8CF000]' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 accent-black"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                        {c.firstName} {c.lastName}
                        {c.redeploy && <><RedeployBadge /><LwdChip lwd={c.redeploy.lwd} /></>}
                      </p>
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
                        <span className={`text-sm font-semibold ${c.score >= 70 ? 'text-[#2F2C29]' : c.score >= 50 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {c.score}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300" title="Not scored yet">—</span>
                      )}
                    </td>
                  </tr>
  )

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
              Scored <span className="font-medium text-gray-900">{candidates.filter((c) => c.score !== undefined).length}</span> of <span className="font-medium text-gray-900">{candidates.length}</span> matching candidates
              {total > candidates.length && <span className="text-gray-400"> (top {candidates.length} of {total})</span>}
            </span>
          )}
          {scoring && !loading && (
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#8CF000] animate-pulse" />
              Scoring candidates…
            </span>
          )}
          {!scoring && !loading && pending.length > 0 && (
            <Button size="sm" variant="outline" onClick={scoreMore}>
              Score {Math.min(SCORE_BATCH, pending.length)} more
            </Button>
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
                {(() => {
                  // One list by real score (desc); identical score → redeploy first. Unscored below, in prefilter order.
                  const scored = candidates.filter((c) => c.score !== undefined)
                    .sort((a, b) => b.score! - a.score! || Number(!!b.redeploy) - Number(!!a.redeploy))
                  const unscored = candidates.filter((c) => c.score === undefined)
                  return (
                    <>
                      {scored.map(renderRow)}
                      {unscored.length > 0 && (
                        <tr className="bg-[#F5F0EB]">
                          <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#2F2C29]">
                            Not scored yet <span className="ml-1 font-normal normal-case tracking-normal text-gray-500">(ranked by skill match)</span>
                          </td>
                        </tr>
                      )}
                      {unscored.map(renderRow)}
                    </>
                  )
                })()}
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
