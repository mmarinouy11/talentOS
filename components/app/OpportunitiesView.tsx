'use client'

import { Fragment, useMemo, useState } from 'react'

export interface OpportunityGroupRow {
  groupKey: string
  designation: string
  account: string | null
  location: string
  workMode: string | null
  grade: string | null
  experience: string | null
  mandatorySkills: string[]
  skillText: string
  openings: number
  requisitionIds: string[]
  plannedOnboarding: string | null
  stage: string | null
  confidence: string | null
}

const selectCls = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-[#2F2C29] focus:outline-none'
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—')

export function OpportunitiesView({ rows }: { rows: OpportunityGroupRow[] }) {
  const [location, setLocation] = useState('')
  const [mode, setMode] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const locations = useMemo(() => [...new Set(rows.map((r) => r.location))].sort(), [rows])
  const filtered = rows.filter((r) => {
    if (location && r.location !== location) return false
    if (mode && (r.workMode ?? 'Unknown') !== mode) return false
    const s = q.trim().toLowerCase()
    if (s && !r.skillText.includes(s) && !r.designation.toLowerCase().includes(s)) return false
    return true
  })
  const toggle = (k: string) => { const n = new Set(open); if (n.has(k)) n.delete(k); else n.add(k); setOpen(n) }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location">
          <option value="">All locations</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className={selectCls} value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Work mode">
          <option value="">All work modes</option>
          <option value="Hybrid">Hybrid</option>
          <option value="Remote">Remote</option>
          <option value="Unknown">Unknown</option>
        </select>
        <input className={`${selectCls} w-56`} placeholder="Search skill or role…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} groups · {filtered.reduce((n, r) => n + r.openings, 0)} openings</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-[2px] border-b-[#8CF000] bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2">Designation</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Work mode</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">Experience</th>
              <th className="px-3 py-2">Mandatory skills</th>
              <th className="px-3 py-2 text-right">Openings</th>
              <th className="px-3 py-2 text-right">Reqs</th>
              <th className="px-3 py-2">Onboarding</th>
              <th className="px-3 py-2">Stage / Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">No open opportunities</td></tr>}
            {filtered.map((r) => (
              <Fragment key={r.groupKey}>
                <tr className="hover:bg-[#F5F0EB] transition-colors align-top">
                  <td className="px-3 py-2.5 font-medium text-gray-900">{r.designation}</td>
                  <td className="px-3 py-2.5 text-gray-700">{r.account ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700">{r.location}</td>
                  <td className="px-3 py-2.5 text-gray-700">{r.workMode ?? 'Unknown'}</td>
                  <td className="px-3 py-2.5 text-gray-700">{r.grade ?? '—'}</td>
                  <td className="px-3 py-2.5 text-gray-700">{r.experience ?? '—'}</td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{r.mandatorySkills.slice(0, 6).map((s) => <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{s}</span>)}{r.mandatorySkills.length > 6 && <span className="text-xs text-gray-400">+{r.mandatorySkills.length - 6}</span>}</div></td>
                  <td className="px-3 py-2.5 text-right font-medium text-[#2F2C29]">{r.openings}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900" onClick={() => toggle(r.groupKey)}>
                      {open.has(r.groupKey) ? '▾' : '▸'} {r.requisitionIds.length}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{fmt(r.plannedOnboarding)}</td>
                  <td className="px-3 py-2.5 text-gray-700">{[r.stage, r.confidence].filter(Boolean).join(' / ') || '—'}</td>
                </tr>
                {open.has(r.groupKey) && (
                  <tr><td colSpan={11} className="bg-gray-50 px-3 py-2 text-xs text-gray-600">Requisition IDs: {r.requisitionIds.join(', ')}</td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
