'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LwdChip } from './RedeployBadge'
import { STAGE_SHORT_LABELS } from '@/lib/stage-labels'

export interface RedeploymentRow {
  id: string
  rosterId: string
  name: string
  candidateId: string | null
  lastJobTitle: string | null
  lastClient: string | null
  grade: string | null
  primarySkill: string | null
  subSkill: string | null
  yearsExperience: number | null
  location: string | null
  lwd: string | null
  status: 'ACTIVE' | 'OUT_OF_WINDOW' | 'REMOVED'
  pipelines: { cpId: string; positionId: string; title: string; client: string; stage: string }[]
  rosterCvId: string | null
  duplicateOf: { id: string; name: string; email: string | null } | null
  // Open, not fulfilled, requisition or proactive, and not already linked to this candidate (lib/assignable-positions)
  assignable: { id: string; title: string; client: string; type: 'REQUISITION' | 'PROACTIVE' }[]
  noEmail: boolean
}

type Timing = 'all' | 'soon' | 'released'

const selectCls = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-[#2F2C29] focus:outline-none'

export function RedeploymentTable({ rows, canAct }: { rows: RedeploymentRow[]; canAct: boolean }) {
  const router = useRouter()
  const [status, setStatus] = useState<'ACTIVE' | 'OUT_OF_WINDOW' | 'REMOVED' | 'ALL'>('ACTIVE')
  const [skill, setSkill] = useState('')
  const [timing, setTiming] = useState<Timing>('all')
  const [needsDecision, setNeedsDecision] = useState(false)
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [rowMsg, setRowMsg] = useState<Record<string, { text: string; error: boolean }>>({})
  const [target, setTarget] = useState<Record<string, string>>({})

  const filtered = useMemo(() => {
    const q = skill.trim().toLowerCase()
    const now = Date.now()
    return rows.filter((r) => {
      if (status !== 'ALL' && r.status !== status) return false
      if (needsDecision && !r.duplicateOf) return false
      if (q && ![r.primarySkill, r.subSkill, r.lastJobTitle].some((v) => v?.toLowerCase().includes(q))) return false
      if (timing !== 'all') {
        if (!r.lwd) return false
        const future = new Date(r.lwd).getTime() >= now - 86_400_000
        if (timing === 'soon' && !future) return false
        if (timing === 'released' && future) return false
      }
      return true
    })
  }, [rows, status, skill, timing, needsDecision])

  const pendingCount = rows.filter((r) => r.duplicateOf && r.status === 'ACTIVE').length

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Something went wrong')
    return data
  }

  async function decide(id: string, decision: 'same' | 'different') {
    setBusyRow(id); setRowMsg((m) => ({ ...m, [id]: { text: '', error: false } }))
    try {
      await post(`/api/redeployment/${id}/decide`, { decision })
      router.refresh()
    } catch (err) {
      setRowMsg((m) => ({ ...m, [id]: { text: (err as Error).message, error: true } }))
    } finally {
      setBusyRow(null)
    }
  }

  // Same flow as adding from a position: first stage, StageHistory, fit score via getOrComputeFitScore
  async function addToPosition(row: RedeploymentRow) {
    const positionId = target[row.id]
    if (!positionId || !row.candidateId) return
    setBusyRow(row.id); setRowMsg((m) => ({ ...m, [row.id]: { text: '', error: false } }))
    try {
      await post('/api/candidate-positions', { candidateId: row.candidateId, positionId })
      setRowMsg((m) => ({ ...m, [row.id]: { text: 'Added — scoring in progress', error: false } }))
      setTarget((t) => ({ ...t, [row.id]: '' }))
      router.refresh()
    } catch (err) {
      setRowMsg((m) => ({ ...m, [row.id]: { text: (err as Error).message, error: true } }))
    } finally {
      setBusyRow(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="ACTIVE">Active</option>
          <option value="OUT_OF_WINDOW">Out of window</option>
          <option value="REMOVED">Removed from roster</option>
          <option value="ALL">All statuses</option>
        </select>
        <select className={selectCls} value={timing} onChange={(e) => setTiming(e.target.value as Timing)} aria-label="Release timing">
          <option value="all">Releasing soon + released</option>
          <option value="soon">Releasing soon</option>
          <option value="released">Released</option>
        </select>
        <input className={`${selectCls} w-56`} placeholder="Search skill or role…" value={skill} onChange={(e) => setSkill(e.target.value)} />
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" className="accent-[#2F2C29]" checked={needsDecision} onChange={(e) => setNeedsDecision(e.target.checked)} />
          Needs decision{pendingCount > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{pendingCount}</span>}
        </label>
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} of {rows.length}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-[2px] border-b-[#8CF000] bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Last role</th>
              <th className="px-3 py-2">Last client</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">Primary / Sub skill</th>
              <th className="px-3 py-2 text-right">Years</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">LWD</th>
              <th className="px-3 py-2">Active pipelines</th>
              <th className="px-3 py-2">CV</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">No people match these filters</td></tr>}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-[#F5F0EB] transition-colors align-top">
                <td className="px-3 py-2.5">
                  {r.candidateId
                    ? <Link href={`/candidates/${r.candidateId}`} className="font-medium text-gray-900 hover:underline">{r.name}</Link>
                    : <span className="font-medium text-gray-900">{r.name}</span>}
                  {r.status !== 'ACTIVE' && <span className="block text-xs text-gray-400">{r.status === 'REMOVED' ? 'Removed from roster' : 'Out of window'}</span>}
                </td>
                <td className="px-3 py-2.5 text-gray-700">{r.lastJobTitle ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-700">{r.lastClient ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-700">{r.grade ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-700">{[r.primarySkill, r.subSkill].filter(Boolean).join(' / ') || '—'}</td>
                <td className="px-3 py-2.5 text-right text-gray-700">{r.yearsExperience ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-700">{r.location ?? '—'}</td>
                <td className="px-3 py-2.5"><LwdChip lwd={r.lwd} /></td>
                <td className="px-3 py-2.5">
                  {r.pipelines.length === 0
                    ? <span className="text-gray-400">—</span>
                    : <ul className="space-y-0.5">{r.pipelines.map((p) => (
                        <li key={p.cpId}><Link href={`/positions/${p.positionId}/candidates/${p.cpId}`} className="text-gray-700 hover:underline">{p.title}</Link> <span className="text-xs text-gray-500">· {STAGE_SHORT_LABELS[p.stage] ?? p.stage}</span></li>
                      ))}</ul>}
                </td>
                <td className="px-3 py-2.5">
                  {r.rosterCvId
                    ? <a href={`https://drive.google.com/file/d/${r.rosterCvId}/view`} target="_blank" rel="noopener noreferrer" className="text-gray-700 underline underline-offset-2">Roster CV</a>
                    : <span className="text-xs text-gray-400">Missing</span>}
                </td>
                <td className="px-3 py-2.5 text-xs min-w-[220px]">
                  {r.duplicateOf && (
                    <div className="space-y-1.5">
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Possible duplicate</span>
                      <p className="text-gray-700">
                        <Link href={`/candidates/${r.duplicateOf.id}`} target="_blank" className="font-medium underline underline-offset-2">{r.duplicateOf.name}</Link>
                        {r.duplicateOf.email && <span className="text-gray-500"> · {r.duplicateOf.email}</span>}
                      </p>
                      {canAct && (busyRow === r.id
                        ? <span className="inline-flex items-center gap-1.5 text-gray-500"><span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-[#2F2C29]" />Working…</span>
                        : <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => decide(r.id, 'same')} disabled={busyRow !== null}>Same person</Button>
                            <Button size="sm" variant="outline" onClick={() => decide(r.id, 'different')} disabled={busyRow !== null}>Different person</Button>
                          </div>)}
                    </div>
                  )}
                  {r.noEmail && <span className="text-gray-500">No email in the roster — add one in the sheet; the next sync creates the candidate.</span>}
                  {r.candidateId && canAct && r.status === 'ACTIVE' && r.assignable.length === 0 && (
                    <span className="text-gray-400">No open positions to add to</span>
                  )}
                  {r.candidateId && canAct && r.status === 'ACTIVE' && r.assignable.length > 0 && (
                    <div className="space-y-1">
                    <div className="flex gap-1.5">
                      <select className={`${selectCls} text-xs py-1 max-w-[160px]`} value={target[r.id] ?? ''} onChange={(e) => setTarget((t) => ({ ...t, [r.id]: e.target.value }))} aria-label={`Position for ${r.name}`}>
                        <option value="">Add to position…</option>
                        {r.assignable.map((p) => (
                          <option key={p.id} value={p.id}>{p.title} · {p.client}{p.type === 'PROACTIVE' ? ' (Proactive)' : ''}</option>
                        ))}
                      </select>
                      <Button size="sm" onClick={() => addToPosition(r)} disabled={!target[r.id] || busyRow !== null}>{busyRow === r.id ? '…' : 'Add'}</Button>
                    </div>
                    {r.assignable.find((p) => p.id === target[r.id])?.type === 'PROACTIVE' && (
                      <span className="inline-flex rounded-full bg-[#F5F0EB] px-2 py-0.5 text-xs font-medium text-[#2F2C29]">Proactive</span>
                    )}
                    </div>
                  )}
                  {rowMsg[r.id]?.text && <p className={`mt-1 ${rowMsg[r.id].error ? 'text-red-600' : 'text-gray-600'}`}>{rowMsg[r.id].text}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
