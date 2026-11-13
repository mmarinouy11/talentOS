'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LwdChip } from './RedeployBadge'

type Status = 'NEW' | 'PROPOSED' | 'DISMISSED'

export interface MatchPerson {
  id: string
  candidateId: string | null
  name: string
  lastJobTitle: string | null
  grade: string | null
  lwd: string | null
  matches: {
    id: string; score: number; status: Status; rationale: string; strengths: string[]; gaps: string[]; notes: string | null
    designation: string; account: string | null; location: string; workMode: string | null; openings: number
    requisitionIds: string[]; plannedOnboarding: string | null
  }[]
}

const selectCls = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-[#2F2C29] focus:outline-none'
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—')
const STATUS_BADGE: Record<Status, string> = {
  NEW: 'bg-[#8CF000] text-[#2F2C29]',
  PROPOSED: 'bg-[#2F2C29] text-white',
  DISMISSED: 'bg-gray-100 text-gray-500',
}

export function GlobalMatchesView({ people, defaultMinScore, isAdmin, canAct, groupCount }: {
  people: MatchPerson[]; defaultMinScore: number; isAdmin: boolean; canAct: boolean; groupCount: number
}) {
  const router = useRouter()
  const [status, setStatus] = useState<'OPEN' | Status | 'ALL'>('OPEN')
  const [minScore, setMinScore] = useState(defaultMinScore)
  const [location, setLocation] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const locations = [...new Set(people.flatMap((p) => p.matches.map((m) => m.location)))].sort()
  const visible = people
    .map((p) => ({
      ...p,
      matches: p.matches.filter((m) =>
        (status === 'ALL' || (status === 'OPEN' ? m.status !== 'DISMISSED' : m.status === status))
        && m.score >= minScore && (!location || m.location === location)),
    }))
    .filter((p) => p.matches.length > 0)

  async function act(id: string, action: 'propose' | 'dismiss' | 'reopen', notes?: string) {
    setBusy(id); setMsg('')
    try {
      const res = await fetch(`/api/opportunity-matches/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(notes !== undefined ? { notes } : {}) }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Could not update the match'); return }
      setNoteFor(null); setNote('')
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function adminPost(url: string, done: (d: Record<string, unknown>) => string) {
    setBusy(url); setMsg('')
    try {
      const res = await fetch(url, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      setMsg(res.ok ? done(d) : (d.error ?? 'Something went wrong'))
    } finally {
      setBusy(null)
    }
  }

  const toggle = (id: string) => { const n = new Set(expanded); if (n.has(id)) n.delete(id); else n.add(id); setExpanded(n) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="OPEN">New + Proposed</option>
          <option value="NEW">New</option>
          <option value="PROPOSED">Proposed</option>
          <option value="DISMISSED">Dismissed</option>
          <option value="ALL">All</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          Min score
          <input type="number" min={0} max={100} className={`${selectCls} w-20`} value={minScore} onChange={(e) => setMinScore(Number(e.target.value) || 0)} />
        </label>
        <select className={selectCls} value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="text-xs text-gray-500">{groupCount} active opportunity groups · <Link href="/opportunities" className="underline underline-offset-2">Opportunities</Link></span>
        {isAdmin && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => adminPost('/api/redeployment/matching/recompute', () => 'Recomputing matches in the background — refresh in a few minutes.')}>Recompute matches</Button>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => adminPost('/api/redeployment/digest/test', (d) => `Test digest sent to ${d.sentTo}.`)}>Send test digest to me</Button>
          </div>
        )}
      </div>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}

      {visible.length === 0 && <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">No matches for these filters</div>}
      {visible.map((p) => (
        <div key={p.id} className="bg-white rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
            {p.candidateId ? <Link href={`/candidates/${p.candidateId}`} className="font-medium text-gray-900 hover:underline">{p.name}</Link> : <span className="font-medium text-gray-900">{p.name}</span>}
            <span className="text-sm text-gray-500">{[p.lastJobTitle, p.grade && `Grade ${p.grade}`].filter(Boolean).join(' · ')}</span>
            <LwdChip lwd={p.lwd} />
          </div>
          <ul className="divide-y divide-gray-100">
            {p.matches.map((m) => (
              <li key={m.id} className="px-4 py-3 hover:bg-[#F5F0EB] transition-colors">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="text-lg font-semibold text-[#2F2C29] w-10">{m.score}</span>
                  <div className="flex-1 min-w-[240px]">
                    <p className="text-sm font-medium text-gray-900">
                      {m.designation} <span className={`ml-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[m.status]}`}>{m.status === 'NEW' ? 'New' : m.status === 'PROPOSED' ? 'Proposed' : 'Dismissed'}</span>
                    </p>
                    <p className="text-xs text-gray-600">{m.account ?? '—'} · {m.location} · {m.workMode ?? 'Unknown'} · {m.openings} opening{m.openings === 1 ? '' : 's'} · Onboarding {fmt(m.plannedOnboarding)}</p>
                    <p className="text-xs text-gray-400">Req {m.requisitionIds.join(', ')}</p>
                    {m.notes && <p className="text-xs text-gray-600 mt-1">Note: {m.notes}</p>}
                    <button type="button" className="mt-1 text-xs font-medium text-gray-600 underline underline-offset-2" onClick={() => toggle(m.id)}>{expanded.has(m.id) ? '▾ Hide details' : '▸ Rationale, strengths, gaps'}</button>
                    {expanded.has(m.id) && (
                      <div className="mt-2 space-y-2 text-sm text-gray-700">
                        <p>{m.rationale}</p>
                        {m.strengths.length > 0 && <ul className="space-y-0.5">{m.strengths.map((s, i) => <li key={i}><span className="text-[#2F2C29] font-semibold">+</span> {s}</li>)}</ul>}
                        {m.gaps.length > 0 && <ul className="space-y-0.5">{m.gaps.map((g, i) => <li key={i}><span className="text-amber-600 font-semibold">−</span> {g}</li>)}</ul>}
                      </div>
                    )}
                  </div>
                  {canAct && (
                    <div className="flex flex-col items-end gap-1.5">
                      {noteFor === m.id ? (
                        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); act(m.id, 'propose', note) }}>
                          <input className={`${selectCls} w-48 text-xs`} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                          <Button size="sm" type="submit" disabled={busy !== null}>Save</Button>
                          <Button size="sm" type="button" variant="outline" onClick={() => setNoteFor(null)}>Cancel</Button>
                        </form>
                      ) : (
                        <div className="flex gap-1.5">
                          {m.status !== 'PROPOSED' && m.status !== 'DISMISSED' && <Button size="sm" disabled={busy !== null} onClick={() => { setNoteFor(m.id); setNote(m.notes ?? '') }}>Mark as proposed</Button>}
                          {m.status !== 'DISMISSED' && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(m.id, 'dismiss')}>Dismiss</Button>}
                          {m.status !== 'NEW' && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(m.id, 'reopen')}>Reopen</Button>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
