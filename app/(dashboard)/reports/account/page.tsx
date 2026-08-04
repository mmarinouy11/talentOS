'use client'

import { useEffect, useState, useCallback } from 'react'

const STAGE_COLORS: Record<string, string> = {
  'Hired':               'bg-green-100 text-green-800',
  'Offer':               'bg-emerald-100 text-emerald-800',
  'Client Interview':    'bg-blue-100 text-blue-800',
  'Manager Interview':   'bg-indigo-100 text-indigo-800',
  'Technical Interview': 'bg-violet-100 text-violet-800',
  'Screening':           'bg-amber-100 text-amber-800',
  'Applied':             'bg-gray-100 text-gray-700',
}

interface CandidateEntry { name: string; daysInStage: number }
interface PipelineStage  { stage: string; label: string; count: number; candidates: CandidateEntry[] }
interface Movement       { name: string; source?: string; from?: string; to?: string; decision?: string; roundLabel?: string; notes?: string | null }
interface PositionData {
  id: string; title: string; recruiter: string
  vendorMinFitScore: number | null; directMinFitScore: number | null
  partners: string[]
  totalCandidates: number; activeCandidates: number; notMovingForward: number
  pipeline: PipelineStage[]
  movements: { newCandidates: Movement[]; stageChanges: Movement[]; decisions: Movement[] }
}
interface AccountData {
  client: string; totalPositions: number; totalActive: number; totalNotMoving: number
  positions: PositionData[]
  generatedAt: string
}

function AgingBadge({ days }: { days: number }) {
  const cls = days >= 14 ? 'text-red-600 font-semibold'
    : days >= 7  ? 'text-amber-600'
    : 'text-gray-400'
  return <span className={`text-xs ${cls}`}>({days === 0 ? 'today' : `${days}d`})</span>
}

function PositionCard({ pos }: { pos: PositionData }) {
  const [open, setOpen] = useState(true)
  const hasMovements =
    pos.movements.newCandidates.length > 0 ||
    pos.movements.stageChanges.length > 0 ||
    pos.movements.decisions.length > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Card header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base font-semibold text-gray-900 truncate">{pos.title}</span>
          <span className="text-sm text-gray-500 shrink-0">· {pos.recruiter}</span>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          <div className="flex gap-3 text-sm">
            <span className="text-gray-500">Total <span className="font-medium text-gray-900">{pos.totalCandidates}</span></span>
            <span className="text-gray-500">Active <span className="font-medium text-green-700">{pos.activeCandidates}</span></span>
            <span className="text-gray-500">NMF <span className="font-medium text-gray-400">{pos.notMovingForward}</span></span>
          </div>
          <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-100">
          {/* Pipeline breakdown */}
          {pos.pipeline.length === 0 ? (
            <p className="text-sm text-gray-400 pt-4">No active candidates.</p>
          ) : (
            <div className="pt-4 space-y-3">
              {pos.pipeline.map((s) => (
                <div key={s.stage} className="flex items-start gap-3">
                  <span className={`shrink-0 mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[s.label] ?? 'bg-gray-100 text-gray-700'}`}>
                    {s.label} ({s.count})
                  </span>
                  <span className="text-sm text-gray-700 leading-snug">
                    {s.candidates.map((c, i) => (
                      <span key={i}>{i > 0 && ', '}{c.name} <AgingBadge days={c.daysInStage} /></span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Meta row: partners + thresholds */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm pt-1 border-t border-gray-100">
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1.5">Partners</span>
              <span className="text-gray-700">{pos.partners.length > 0 ? pos.partners.join(', ') : '—'}</span>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1.5">Vendor min score</span>
              <span className="text-gray-700">{pos.vendorMinFitScore != null ? `${pos.vendorMinFitScore}%` : 'default'}</span>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1.5">Direct min score</span>
              <span className="text-gray-700">{pos.directMinFitScore != null ? `${pos.directMinFitScore}%` : 'default'}</span>
            </div>
          </div>

          {/* Recent activity */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Activity (last 7 days)</p>
            {!hasMovements ? (
              <p className="text-sm text-gray-400">No recent activity.</p>
            ) : (
              <div className="space-y-3 text-sm">
                {pos.movements.newCandidates.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">New candidates added</p>
                    <ul className="space-y-0.5 pl-3">
                      {pos.movements.newCandidates.map((m, i) => (
                        <li key={i} className="text-gray-600">{m.name} <span className="text-gray-400">({m.source})</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {pos.movements.stageChanges.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Stage changes</p>
                    <ul className="space-y-0.5 pl-3">
                      {pos.movements.stageChanges.map((m, i) => (
                        <li key={i} className="text-gray-600">{m.name}: <span className="text-gray-500">{m.from} → {m.to}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {pos.movements.decisions.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-700 mb-1">Decisions made</p>
                    <ul className="space-y-0.5 pl-3">
                      {pos.movements.decisions.map((m, i) => (
                        <li key={i} className="text-gray-600">
                          {m.name}: <span className="text-gray-500">{m.decision} ({m.roundLabel}){m.notes ? ` — ${m.notes}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AccountStatusPage() {
  const [clients, setClients] = useState<string[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [data, setData] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/reports/account-status')
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .catch(() => setError('Failed to load client list'))
  }, [])

  const load = useCallback(async (client: string) => {
    if (!client) { setData(null); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/reports/account-status?client=${encodeURIComponent(client)}`)
      if (!res.ok) throw new Error('Failed to load')
      setData(await res.json())
    } catch {
      setError('Failed to load account data')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSelect = (client: string) => {
    setSelectedClient(client)
    load(client)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Account Status</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live pipeline view per client</p>
        </div>
        {data && (
          <p className="text-xs text-gray-400 mt-1">
            Last updated: {new Date(data.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Account selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">Select Account</label>
        <select
          value={selectedClient}
          onChange={(e) => handleSelect(e.target.value)}
          className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[240px]"
        >
          <option value="">— Choose a client —</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {loading && <span className="text-sm text-gray-400">Loading…</span>}
        {selectedClient && !loading && (
          <button
            onClick={() => load(selectedClient)}
            className="text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
          >
            Refresh
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Empty state */}
      {!selectedClient && !loading && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-8 py-16 text-center">
          <p className="text-gray-500 text-sm">Select an account to view its pipeline status.</p>
        </div>
      )}

      {/* Account summary + positions */}
      {data && !loading && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-wrap gap-6">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Account</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{data.client}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Open Positions</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{data.totalPositions}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Candidates</p>
              <p className="text-lg font-semibold text-green-700 mt-0.5">{data.totalActive}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Not Moving Forward</p>
              <p className="text-lg font-semibold text-gray-400 mt-0.5">{data.totalNotMoving}</p>
            </div>
          </div>

          {data.positions.length === 0 ? (
            <p className="text-sm text-gray-500">No open positions for this account.</p>
          ) : (
            data.positions.map((pos) => <PositionCard key={pos.id} pos={pos} />)
          )}
        </div>
      )}
    </div>
  )
}
