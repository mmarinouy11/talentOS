'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LwdChip } from './RedeployBadge'
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
}
export type Match =
  | (MatchBase & { kind: 'position'; targetKey: string; positionId: string; title: string; client: string; proactive: boolean })
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
  const [proposing, setProposing] = useState<{ person: MatchPerson; match: Extract<Match, { kind: 'group' }> } | null>(null)
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
          matchId={proposing.match.id} profileId={proposing.person.id} personName={proposing.person.name} designation={proposing.match.designation}
          onClose={() => setProposing(null)}
          onDone={(text) => { setProposing(null); setMsg(text); router.refresh() }}
        />
      )}
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
                          {m.kind === 'group' && m.proposal && (
                            <p className="text-xs text-gray-600 mt-1">
                              Proposed to {m.proposal.to.join(', ')} · {fmt(m.proposal.sentAt)} · by {m.proposal.by}{m.proposal.method === 'MANUAL' ? ' (sent manually)' : ''}
                              {' · '}<button type="button" className="underline underline-offset-2" onClick={() => setOpenEmail(openEmail === m.id ? null : m.id)}>{openEmail === m.id ? 'Hide email' : 'View email'}</button>
                            </p>
                          )}
                          {m.kind === 'group' && m.proposal && openEmail === m.id && (
                            <div className="mt-2 rounded-lg border border-gray-200 bg-[#F5F0EB] p-3 text-xs text-gray-700 space-y-1">
                              <p><span className="font-medium">To:</span> {m.proposal.to.join(', ')}{m.proposal.cc.length > 0 && <> · <span className="font-medium">CC:</span> {m.proposal.cc.join(', ')}</>}</p>
                              <p><span className="font-medium">Subject:</span> {m.proposal.subject}</p>
                              {m.proposal.attachmentName && <p><span className="font-medium">Attachment:</span> {m.proposal.attachmentName}</p>}
                              <pre className="whitespace-pre-wrap font-sans text-xs text-gray-800 pt-1">{m.proposal.body}</pre>
                            </div>
                          )}
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
                                {m.kind === 'group' && m.status !== 'DISMISSED' && <Button size="sm" disabled={busy !== null} onClick={() => setProposing({ person: p, match: m })}>{m.status === 'PROPOSED' ? 'Propose again' : 'Propose by email'}</Button>}
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
