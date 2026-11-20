'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LwdChip, RedeployBadge } from './RedeployBadge'
import { ProposeByEmailModal } from './ProposeByEmailModal'

type Status = 'NEW' | 'PROPOSED' | 'DISMISSED'

export interface MatchPerson {
  id: string
  candidateId: string | null
  name: string
  lastJobTitle: string | null
  grade: string | null
  lwd: string | null
  matches: Match[]
}

type MatchBase = { id: string; score: number; status: Status; rationale: string; strengths: string[]; gaps: string[]; notes: string | null }
export type ProposalInfo = {
  to: string[]; cc: string[]; subject: string; body: string; attachmentName: string | null; sentAt: string; by: string; method: string
  people: string[] // everyone included in the same email (batch); empty for older single proposals
}
export type Match =
  | (MatchBase & { kind: 'position'; targetKey: string; positionId: string; title: string; client: string; proactive: boolean; positionLocation: string | null; positionOpenings: number | null })
  | (MatchBase & {
      kind: 'group'; targetKey: string; proposal: ProposalInfo | null; designation: string; account: string | null; location: string
      workMode: string | null; openings: number; requisitionIds: string[]; plannedOnboarding: string | null
    })

export type ExclusionsData = {
  people: { profileId: string; name: string; reason: string | null; at: string | null; by: string }[]
  targets: { id: string; kind: 'group' | 'position'; label: string; reason: string | null; at: string; by: string }[]
}

const selectCls = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-[#2F2C29] focus:outline-none'
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—')
const STATUS_BADGE: Record<Status, string> = {
  NEW: 'bg-[#8CF000] text-[#2F2C29]',
  PROPOSED: 'bg-[#2F2C29] text-white',
  DISMISSED: 'bg-gray-100 text-gray-500',
}

export function GlobalMatchesView({ people, defaultMinScore, isAdmin, canAct, groupCount, exclusions }: {
  people: MatchPerson[]; defaultMinScore: number; isAdmin: boolean; canAct: boolean; groupCount: number; exclusions: ExclusionsData
}) {
  const router = useRouter()
  const [view, setView] = useState<'matches' | 'exclusions'>('matches')
  const [mode, setMode] = useState<'position' | 'person'>('position')
  const [proposing, setProposing] = useState<{ matchIds: string[]; designation: string } | null>(null)
  const [openEmail, setOpenEmail] = useState<string | null>(null)

  // Exclusions: optional reason; reversible from the Exclusions view
  async function call(url: string, method: 'POST' | 'DELETE', body?: unknown, done?: string) {
    setBusy(url); setMsg('')
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(typeof d.error === 'string' ? d.error : 'Something went wrong'); return }
      if (done) setMsg(done)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }
  function excludePerson(p: MatchPerson) {
    const reason = window.prompt(`Exclude ${p.name} from matching? Optional reason:`)
    if (reason === null) return
    void call(`/api/redeployment/${p.id}/exclusion`, 'POST', { reason }, `${p.name} excluded from matching.`)
  }
  function excludeTarget(m: Match) {
    const label = m.kind === 'group' ? m.designation : m.title
    const reason = window.prompt(`Exclude "${label}" from matching for everyone? Optional reason:`)
    if (reason === null) return
    void call('/api/match-exclusions', 'POST', m.kind === 'group'
      ? { targetType: 'GLOBAL_GROUP', groupKey: m.targetKey, reason }
      : { targetType: 'TALENTOS_POSITION', positionId: m.targetKey, reason }, `"${label}" excluded for everyone.`)
  }
  const [status, setStatus] = useState<'OPEN' | Status | 'ALL'>('OPEN')
  const [minScore, setMinScore] = useState(defaultMinScore)
  const [location, setLocation] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const locations = [...new Set(people.flatMap((p) => p.matches.flatMap((m) => (m.kind === 'group' ? [m.location] : []))))].sort()
  const visible = people
    .map((p) => ({
      ...p,
      matches: p.matches.filter((m) =>
        (status === 'ALL' || (status === 'OPEN' ? m.status !== 'DISMISSED' : m.status === status))
        && m.score >= minScore && (!location || (m.kind === 'group' && m.location === location))),
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

  // TalentOS positions: add through the Redeployment route (validated server-side; the match becomes PROPOSED)
  async function addToPosition(person: MatchPerson, m: Extract<Match, { kind: 'position' }>) {
    if (!person.candidateId) return
    setBusy(m.id); setMsg('')
    try {
      const res = await fetch('/api/redeployment/add-to-position', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateId: person.candidateId, positionId: m.positionId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(typeof d.error === 'string' ? d.error : 'Could not add to the position'); return }
      setMsg(`${person.name} added to ${m.title} — scoring in progress.`)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const toggle = (id: string) => { const n = new Set(expanded); if (n.has(id)) n.delete(id); else n.add(id); setExpanded(n) }

  const exclusionCount = exclusions.people.length + exclusions.targets.length
  if (view === 'exclusions') {
    return (
      <div className="space-y-4">
        <ViewToggle view={view} setView={setView} exclusionCount={exclusionCount} />
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
        <ExclusionsList data={exclusions} canAct={canAct} busy={busy !== null}
          onReactivatePerson={(id) => call(`/api/redeployment/${id}/exclusion`, 'DELETE', undefined, 'Reactivated — matches are recalculated in the background.')}
          onReactivateTarget={(id) => call(`/api/match-exclusions/${id}`, 'DELETE', undefined, 'Reactivated — matches are recalculated in the background.')} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ViewToggle view={view} setView={setView} exclusionCount={exclusionCount} />
      {proposing && (
        <ProposeByEmailModal
          matchIds={proposing.matchIds} designation={proposing.designation}
          onClose={() => setProposing(null)}
          onDone={(text) => { setProposing(null); setMsg(text); router.refresh() }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {([['position', 'By position'], ['person', 'By person']] as const).map(([v, l]) => (
            <button key={v} type="button" className={`px-2.5 py-1 text-xs rounded-md ${mode === v ? 'bg-[#2F2C29] text-white' : 'text-gray-600 hover:bg-[#F5F0EB]'}`} onClick={() => setMode(v)}>{l}</button>
          ))}
        </div>
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
      {mode === 'position' && (
        <ByPositionView people={visible} canAct={canAct} busy={busy !== null} setBusy={setBusy} setMsg={setMsg}
          onPropose={(matchIds, designation) => setProposing({ matchIds, designation })}
          onDismiss={(id) => act(id, 'dismiss')} onReopen={(id) => act(id, 'reopen')} onExcludeTarget={excludeTarget}
          onRefresh={() => router.refresh()} />
      )}
      {mode === 'person' && visible.map((p) => (
        <div key={p.id} className="bg-white rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
            {p.candidateId ? <Link href={`/candidates/${p.candidateId}`} className="font-medium text-gray-900 hover:underline">{p.name}</Link> : <span className="font-medium text-gray-900">{p.name}</span>}
            <span className="text-sm text-gray-500">{[p.lastJobTitle, p.grade && `Grade ${p.grade}`].filter(Boolean).join(' · ')}</span>
            <LwdChip lwd={p.lwd} />
            {canAct && <button type="button" className="ml-auto text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-900" disabled={busy !== null} onClick={() => excludePerson(p)}>Exclude from matching</button>}
          </div>
          {([['position', 'TalentOS positions'], ['group', 'Global opportunities']] as const).map(([kind, heading]) => {
            const list = p.matches.filter((m) => m.kind === kind)
            if (list.length === 0) return null
            return (
              <div key={kind}>
                <p className="px-4 pt-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{heading}</p>
                <ul className="divide-y divide-gray-100">
                  {list.map((m) => (
                    <li key={m.id} className="px-4 py-3 hover:bg-[#F5F0EB] transition-colors">
                      <div className="flex flex-wrap items-start gap-3">
                        <span className="text-lg font-semibold text-[#2F2C29] w-10">{m.score}</span>
                        <div className="flex-1 min-w-[240px]">
                          {m.kind === 'position' ? (
                            <>
                              <p className="text-sm font-medium text-gray-900">
                                <Link href={`/positions/${m.positionId}`} className="hover:underline">{m.title}</Link>
                                {m.proactive && <span className="ml-1 inline-flex rounded-full bg-[#F5F0EB] px-2 py-0.5 text-xs font-medium text-[#2F2C29]">Proactive</span>}
                                <span className={`ml-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[m.status]}`}>{m.status === 'NEW' ? 'New' : m.status === 'PROPOSED' ? 'Proposed' : 'Dismissed'}</span>
                              </p>
                              <p className="text-xs text-gray-600">{m.client}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-medium text-gray-900">
                                {m.designation} <span className={`ml-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[m.status]}`}>{m.status === 'NEW' ? 'New' : m.status === 'PROPOSED' ? 'Proposed' : 'Dismissed'}</span>
                              </p>
                              <p className="text-xs text-gray-600">{m.account ?? '—'} · {m.location} · {m.workMode ?? 'Unknown'} · {m.openings} opening{m.openings === 1 ? '' : 's'} · Onboarding {fmt(m.plannedOnboarding)}</p>
                              <p className="text-xs text-gray-400">Req {m.requisitionIds.join(', ')}</p>
                            </>
                          )}
                          {m.kind === 'group' && m.proposal && <ProposalLine proposal={m.proposal} open={openEmail === m.id} onToggle={() => setOpenEmail(openEmail === m.id ? null : m.id)} />}
                          {m.notes && <p className="text-xs text-gray-600 mt-1">Note: {m.notes}</p>}
                          <button type="button" className="mt-1 text-xs font-medium text-gray-600 underline underline-offset-2" onClick={() => toggle(m.id)}>{expanded.has(m.id) ? '▾ Hide details' : '▸ Rationale, strengths, gaps'}</button>
                          {expanded.has(m.id) && (
                            <div className="mt-2 space-y-2 text-sm text-gray-700">
                              <p>{m.rationale}</p>
                              {m.strengths.length > 0 && <ul className="space-y-0.5">{m.strengths.map((x, i) => <li key={i}><span className="text-[#2F2C29] font-semibold">+</span> {x}</li>)}</ul>}
                              {m.gaps.length > 0 && <ul className="space-y-0.5">{m.gaps.map((x, i) => <li key={i}><span className="text-amber-600 font-semibold">−</span> {x}</li>)}</ul>}
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
                                {m.kind === 'position' && m.status !== 'DISMISSED' && (
                                  <Button size="sm" disabled={busy !== null || !p.candidateId} onClick={() => addToPosition(p, m)}>{busy === m.id ? 'Adding…' : 'Add to position'}</Button>
                                )}
                                {m.kind === 'group' && m.status !== 'DISMISSED' && <Button size="sm" disabled={busy !== null} onClick={() => setProposing({ matchIds: [m.id], designation: m.designation })}>{m.status === 'PROPOSED' ? 'Propose again' : 'Propose by email'}</Button>}
                                {m.status !== 'DISMISSED' && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(m.id, 'dismiss')}>Dismiss</Button>}
                                {m.status !== 'NEW' && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(m.id, 'reopen')}>Reopen</Button>}
                              </div>
                            )}
                            {noteFor !== m.id && (
                              <button type="button" className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900" disabled={busy !== null} onClick={() => excludeTarget(m)}>Exclude for everyone</button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const statusLabel = (st: Status) => (st === 'NEW' ? 'New' : st === 'PROPOSED' ? 'Proposed' : 'Dismissed')

// "Proposed to … · date · by …" + the full email and everyone included in it
function ProposalLine({ proposal, open, onToggle }: { proposal: ProposalInfo; open: boolean; onToggle: () => void }) {
  return (
    <>
      <p className="text-xs text-gray-600 mt-1">
        Proposed to {proposal.to.join(', ')} · {fmt(proposal.sentAt)} · by {proposal.by}{proposal.method === 'MANUAL' ? ' (sent manually)' : ''}
        {proposal.people.length > 1 ? ` · with ${proposal.people.length - 1} other${proposal.people.length === 2 ? '' : 's'}` : ''}
        {' · '}<button type="button" className="underline underline-offset-2" onClick={onToggle}>{open ? 'Hide email' : 'View email'}</button>
      </p>
      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-[#F5F0EB] p-3 text-xs text-gray-700 space-y-1">
          <p><span className="font-medium">To:</span> {proposal.to.join(', ')}{proposal.cc.length > 0 && <> · <span className="font-medium">CC:</span> {proposal.cc.join(', ')}</>}</p>
          <p><span className="font-medium">Subject:</span> {proposal.subject}</p>
          {proposal.people.length > 0 && <p><span className="font-medium">People in this email:</span> {proposal.people.join(', ')}</p>}
          {proposal.attachmentName && <p><span className="font-medium">Attachments:</span> {proposal.attachmentName}</p>}
          <pre className="whitespace-pre-wrap font-sans text-xs text-gray-800 pt-1">{proposal.body}</pre>
        </div>
      )}
    </>
  )
}

type Row = { person: MatchPerson; match: Match }
type Target = { key: string; kind: 'position' | 'group'; first: Match; rows: Row[] }

// "By position": one card per target (TalentOS positions first, then global groups), matched people by score,
// multi-select → "Add selected to position" / "Propose selected by email"
function ByPositionView({ people, canAct, busy, setBusy, setMsg, onPropose, onDismiss, onReopen, onExcludeTarget, onRefresh }: {
  people: MatchPerson[]; canAct: boolean; busy: boolean
  setBusy: (v: string | null) => void; setMsg: (v: string) => void
  onPropose: (matchIds: string[], designation: string) => void
  onDismiss: (id: string) => void; onReopen: (id: string) => void; onExcludeTarget: (m: Match) => void; onRefresh: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [openEmail, setOpenEmail] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { name: string; ok: boolean; text: string }[]>>({})

  const byKey = new Map<string, Target>()
  for (const person of people) {
    for (const match of person.matches) {
      const key = `${match.kind}:${match.targetKey}`
      const t = byKey.get(key) ?? { key, kind: match.kind, first: match, rows: [] }
      t.rows.push({ person, match })
      byKey.set(key, t)
    }
  }
  const targets = [...byKey.values()]
    .map((t) => ({ ...t, rows: t.rows.sort((a, b) => b.match.score - a.match.score) }))
    .sort((a, b) => (a.kind === b.kind ? b.rows[0].match.score - a.rows[0].match.score : a.kind === 'position' ? -1 : 1))

  const flip = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n }
  const selectable = (r: Row) => r.match.status !== 'DISMISSED' && (r.match.kind === 'group' || !!r.person.candidateId)

  async function addSelected(t: Target, rows: Row[]) {
    if (t.first.kind !== 'position') return
    const positionId = t.first.positionId
    setBusy(t.key); setMsg('')
    const out: { name: string; ok: boolean; text: string }[] = []
    try {
      for (const r of rows) {
        try {
          const res = await fetch('/api/redeployment/add-to-position', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateId: r.person.candidateId, positionId }),
          })
          const d = await res.json().catch(() => ({}))
          out.push({ name: r.person.name, ok: res.ok, text: res.ok ? 'added' : (typeof d.error === 'string' ? d.error : 'Could not add') })
        } catch {
          out.push({ name: r.person.name, ok: false, text: 'connection error' })
        }
      }
    } finally {
      setResults((prev) => ({ ...prev, [t.key]: out }))
      setSelected((prev) => { const n = new Set(prev); rows.forEach((r) => n.delete(r.match.id)); return n })
      setBusy(null)
      if (out.some((o) => o.ok)) onRefresh()
    }
  }

  return (
    <div className="space-y-4">
      {targets.map((t) => {
        const m = t.first
        const selectableRows = t.rows.filter(selectable)
        const chosen = t.rows.filter((r) => selected.has(r.match.id))
        const allChosen = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.match.id))
        return (
          <div key={t.key} className="bg-white rounded-xl border border-gray-200">
            <div className="flex flex-wrap items-start gap-2 px-4 py-3 border-b border-gray-100">
              <div className="flex-1 min-w-[240px]">
                {m.kind === 'position' ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900">
                      <Link href={`/positions/${m.positionId}`} className="hover:underline">{m.title}</Link>
                      <span className="ml-1 inline-flex rounded-full bg-[#F5F0EB] px-2 py-0.5 text-xs font-medium text-[#2F2C29]">{m.proactive ? 'Proactive' : 'TalentOS position'}</span>
                    </p>
                    <p className="text-xs text-gray-600">{m.client}{m.positionLocation ? ` · ${m.positionLocation}` : ''}{m.positionOpenings != null ? ` · ${m.positionOpenings} opening${m.positionOpenings === 1 ? '' : 's'}` : ''}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-gray-900">{m.designation} <span className="ml-1 inline-flex rounded-full bg-[#F5F0EB] px-2 py-0.5 text-xs font-medium text-[#2F2C29]">Global opportunity</span></p>
                    <p className="text-xs text-gray-600">{m.account ?? '—'} · {m.location} · {m.workMode ?? 'Unknown'} · {m.openings} opening{m.openings === 1 ? '' : 's'} · Onboarding {fmt(m.plannedOnboarding)}</p>
                    <p className="text-xs text-gray-400">Req {m.requisitionIds.join(', ')}</p>
                  </>
                )}
              </div>
              {canAct && (
                <div className="flex flex-wrap items-center gap-2">
                  {m.kind === 'position'
                    ? <Button size="sm" disabled={busy || chosen.length === 0} onClick={() => addSelected(t, chosen)}>Add selected to position{chosen.length > 0 ? ` (${chosen.length})` : ''}</Button>
                    : <Button size="sm" disabled={busy || chosen.length === 0} onClick={() => onPropose(chosen.map((r) => r.match.id), m.designation)}>Propose selected by email{chosen.length > 0 ? ` (${chosen.length})` : ''}</Button>}
                  <button type="button" className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900" disabled={busy} onClick={() => onExcludeTarget(m)}>Exclude for everyone</button>
                </div>
              )}
            </div>
            {results[t.key] && (
              <ul className="px-4 py-2 border-b border-gray-100 text-xs space-y-0.5">
                {results[t.key].map((r, i) => <li key={i} className={r.ok ? 'text-[#2F2C29]' : 'text-red-600'}>{r.name}: {r.ok ? 'added — scoring in progress' : `not added — ${r.text}`}</li>)}
              </ul>
            )}
            {canAct && selectableRows.length > 1 && (
              <label className="flex items-center gap-2 px-4 pt-2 text-xs text-gray-600">
                <input type="checkbox" className="h-4 w-4 accent-[#2F2C29]" checked={allChosen}
                  onChange={() => setSelected((prev) => { const n = new Set(prev); selectableRows.forEach((r) => (allChosen ? n.delete(r.match.id) : n.add(r.match.id))); return n })} />
                Select all
              </label>
            )}
            <ul className="divide-y divide-gray-100">
              {t.rows.map(({ person: p, match: r }) => (
                <li key={r.id} className="px-4 py-3 hover:bg-[#F5F0EB] transition-colors">
                  <div className="flex flex-wrap items-start gap-3">
                    {canAct && (
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#2F2C29]" aria-label={`Select ${p.name}`}
                        disabled={!selectable({ person: p, match: r })} checked={selected.has(r.id)} onChange={() => setSelected((prev) => flip(prev, r.id))} />
                    )}
                    <span className="text-lg font-semibold text-[#2F2C29] w-10">{r.score}</span>
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm font-medium text-gray-900 flex flex-wrap items-center gap-1.5">
                        {p.candidateId ? <Link href={`/candidates/${p.candidateId}`} className="hover:underline">{p.name}</Link> : p.name}
                        <RedeployBadge /><LwdChip lwd={p.lwd} />
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>{statusLabel(r.status)}</span>
                      </p>
                      <p className="text-xs text-gray-600">{[p.lastJobTitle, p.grade && `Grade ${p.grade}`].filter(Boolean).join(' · ') || '—'}</p>
                      {r.kind === 'group' && r.proposal && <p className="text-xs text-gray-500">Already proposed on {fmt(r.proposal.sentAt)}</p>}
                      {r.kind === 'group' && r.proposal && <ProposalLine proposal={r.proposal} open={openEmail === r.id} onToggle={() => setOpenEmail(openEmail === r.id ? null : r.id)} />}
                      {r.notes && <p className="text-xs text-gray-600 mt-1">Note: {r.notes}</p>}
                      <button type="button" className="mt-1 text-xs font-medium text-gray-600 underline underline-offset-2" onClick={() => setExpanded((prev) => flip(prev, r.id))}>{expanded.has(r.id) ? '▾ Hide details' : '▸ Rationale, strengths, gaps'}</button>
                      {expanded.has(r.id) && (
                        <div className="mt-2 space-y-2 text-sm text-gray-700">
                          <p>{r.rationale}</p>
                          {r.strengths.length > 0 && <ul className="space-y-0.5">{r.strengths.map((x, i) => <li key={i}><span className="text-[#2F2C29] font-semibold">+</span> {x}</li>)}</ul>}
                          {r.gaps.length > 0 && <ul className="space-y-0.5">{r.gaps.map((x, i) => <li key={i}><span className="text-amber-600 font-semibold">−</span> {x}</li>)}</ul>}
                        </div>
                      )}
                    </div>
                    {canAct && (
                      <div className="flex gap-1.5">
                        {r.status !== 'DISMISSED' && <Button size="sm" variant="outline" disabled={busy} onClick={() => onDismiss(r.id)}>Dismiss</Button>}
                        {r.status === 'DISMISSED' && <Button size="sm" variant="outline" disabled={busy} onClick={() => onReopen(r.id)}>Reopen</Button>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function ViewToggle({ view, setView, exclusionCount }: { view: 'matches' | 'exclusions'; setView: (v: 'matches' | 'exclusions') => void; exclusionCount: number }) {
  const cls = (v: string) => `px-3 py-1.5 text-sm rounded-md ${view === v ? 'bg-[#2F2C29] text-white' : 'text-gray-600 hover:bg-[#F5F0EB]'}`
  return (
    <div className="inline-flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
      <button type="button" className={cls('matches')} onClick={() => setView('matches')}>Matches</button>
      <button type="button" className={cls('exclusions')} onClick={() => setView('exclusions')}>Exclusions{exclusionCount > 0 ? ` (${exclusionCount})` : ''}</button>
    </div>
  )
}

function ExclusionsList({ data, canAct, busy, onReactivatePerson, onReactivateTarget }: {
  data: ExclusionsData; canAct: boolean; busy: boolean
  onReactivatePerson: (profileId: string) => void; onReactivateTarget: (id: string) => void
}) {
  const section = (title: string, rows: { key: string; label: string; reason: string | null; at: string | null; by: string; onReactivate: () => void }[]) => (
    <div className="bg-white rounded-xl border border-gray-200">
      <p className="px-4 pt-3 pb-2 text-xs font-medium uppercase tracking-wide text-gray-500">{title} ({rows.length})</p>
      {rows.length === 0 ? <p className="px-4 pb-3 text-sm text-gray-400">None</p> : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-[#F5F0EB] transition-colors">
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-medium text-gray-900">{r.label}</p>
                <p className="text-xs text-gray-500">By {r.by}{r.at ? ` · ${fmt(r.at)}` : ''}{r.reason ? ` · ${r.reason}` : ''}</p>
              </div>
              {canAct && <Button size="sm" variant="outline" disabled={busy} onClick={r.onReactivate}>Reactivate</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <div className="space-y-4">
      {section('People', data.people.map((p) => ({ key: p.profileId, label: p.name, reason: p.reason, at: p.at, by: p.by, onReactivate: () => onReactivatePerson(p.profileId) })))}
      {section('Global opportunities', data.targets.filter((t) => t.kind === 'group').map((t) => ({ key: t.id, label: t.label, reason: t.reason, at: t.at, by: t.by, onReactivate: () => onReactivateTarget(t.id) })))}
      {section('TalentOS positions', data.targets.filter((t) => t.kind === 'position').map((t) => ({ key: t.id, label: t.label, reason: t.reason, at: t.at, by: t.by, onReactivate: () => onReactivateTarget(t.id) })))}
    </div>
  )
}
