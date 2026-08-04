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

// Ordered most-advanced first (HIRED excluded from cross-position summary)
const SUMMARY_STAGE_ORDER = [
  'OFFER', 'CLIENT_INTERVIEW', 'MANAGER_INTERVIEW',
  'TECHNICAL_INTERVIEW', 'SCREENING', 'APPLIED',
]

interface CandidateEntry { name: string; daysInStage: number }
interface PipelineStage  { stage: string; label: string; count: number; candidates: CandidateEntry[] }
interface PositionData {
  id: string; title: string; recruiter: string
  partners: string[]
  totalCandidates: number; activeCandidates: number; notMovingForward: number
  pipeline: PipelineStage[]
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

function CrossPositionSummary({ positions }: { positions: PositionData[] }) {
  // Build: stage → Map<positionTitle, name[]>
  const byStage = new Map<string, Map<string, string[]>>()
  for (const pos of positions) {
    for (const s of pos.pipeline) {
      if (!byStage.has(s.stage)) byStage.set(s.stage, new Map())
      const byPos = byStage.get(s.stage)!
      if (!byPos.has(pos.title)) byPos.set(pos.title, [])
      for (const c of s.candidates) byPos.get(pos.title)!.push(c.name)
    }
  }

  const stagesWithCandidates = SUMMARY_STAGE_ORDER.filter((s) => byStage.has(s))
  if (stagesWithCandidates.length === 0) return null

  const stageLabel = (stage: string) => {
    for (const pos of positions) {
      const found = pos.pipeline.find((s) => s.stage === stage)
      if (found) return found.label
    }
    return stage
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">All Candidates by Stage</h2>
      <div className="space-y-4">
        {stagesWithCandidates.map((stage) => {
          const label = stageLabel(stage)
          const byPos = byStage.get(stage)!
          const totalCount = Array.from(byPos.values()).reduce((n, arr) => n + arr.length, 0)
          const posEntries = Array.from(byPos.entries())
          const multiPos = posEntries.length > 1

          return (
            <div key={stage}>
              <div className="flex items-start gap-3">
                <span className={`shrink-0 mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[label] ?? 'bg-gray-100 text-gray-700'}`}>
                  {label} ({totalCount})
                </span>
                {!multiPos && (
                  <span className="text-sm text-gray-700 leading-snug">
                    {posEntries[0][1].join(', ')}
                  </span>
                )}
              </div>
              {multiPos && (
                <div className="mt-2 ml-2 space-y-1.5">
                  {posEntries.map(([posTitle, names]) => (
                    <div key={posTitle} className="text-sm">
                      <span className="font-medium text-gray-600">{posTitle} ({names.length}):</span>{' '}
                      <span className="text-gray-700">{names.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PositionCard({ pos }: { pos: PositionData }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
        <div className="px-5 pb-5 border-t border-gray-100">
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

          {pos.partners.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 text-sm">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1.5">Partners</span>
              <span className="text-gray-700">{pos.partners.join(', ')}</span>
            </div>
          )}
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

      {!selectedClient && !loading && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-8 py-16 text-center">
          <p className="text-gray-500 text-sm">Select an account to view its pipeline status.</p>
        </div>
      )}

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
            <>
              {/* Cross-position summary — only when multiple positions */}
              {data.positions.length > 1 && (
                <CrossPositionSummary positions={data.positions} />
              )}
              {data.positions.map((pos) => <PositionCard key={pos.id} pos={pos} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
