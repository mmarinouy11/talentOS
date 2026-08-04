'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

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

interface CandidateEntry { cpId: string; name: string; daysInStage: number }
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

// Activity Feed types
interface ActivityScheduled { stage: string; count: number }
interface ActivityDecision  { decision: string; stage: string; count: number }
interface ActivityPosition  { posId: string; title: string; scheduled: ActivityScheduled[]; decisions: ActivityDecision[] }
interface ActivityDay       { date: string; positions: ActivityPosition[] }
interface ActivityData      { client: string; days: ActivityDay[]; generatedAt: string }

type Period = 'today' | 'yesterday' | 'last7' | 'next7' | 'custom'

function periodDates(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date()
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x }
  const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x }
  if (period === 'today') {
    return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
  }
  if (period === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1)
    return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() }
  }
  if (period === 'last7') {
    const y = new Date(now); y.setDate(y.getDate() - 6)
    return { from: startOfDay(y).toISOString(), to: endOfDay(now).toISOString() }
  }
  if (period === 'next7') {
    const f = new Date(now); f.setDate(f.getDate() + 7)
    return { from: startOfDay(now).toISOString(), to: endOfDay(f).toISOString() }
  }
  // custom — no date restrictions, supports past and future
  return {
    from: customFrom ? new Date(customFrom + 'T00:00:00').toISOString() : startOfDay(now).toISOString(),
    to:   customTo   ? new Date(customTo   + 'T23:59:59').toISOString() : endOfDay(now).toISOString(),
  }
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function DecisionBadge({ decision, stage, count }: { decision: string; stage: string; count: number }) {
  const label = `${count} ${decision === 'ADVANCE' ? 'Advance' : decision === 'REJECT' ? 'Reject' : 'Hold'} (${stage})`
  if (decision === 'ADVANCE') return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700"><span>✓</span><span>{label}</span></span>
  if (decision === 'REJECT')  return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600"><span>✗</span><span>{label}</span></span>
  return <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600"><span>⏸</span><span>{label}</span></span>
}

function AgingBadge({ days }: { days: number }) {
  const cls = days >= 14 ? 'text-red-600 font-semibold'
    : days >= 7  ? 'text-amber-600'
    : 'text-gray-400'
  return <span className={`text-xs ${cls}`}>({days === 0 ? 'today' : `${days}d`})</span>
}

function CrossPositionSummary({ positions }: { positions: PositionData[] }) {
  const byStage = new Map<string, Map<string, { posId: string; entries: { cpId: string; name: string }[] }>>()
  for (const pos of positions) {
    for (const s of pos.pipeline) {
      if (!byStage.has(s.stage)) byStage.set(s.stage, new Map())
      const byPos = byStage.get(s.stage)!
      if (!byPos.has(pos.title)) byPos.set(pos.title, { posId: pos.id, entries: [] })
      for (const c of s.candidates) byPos.get(pos.title)!.entries.push({ cpId: c.cpId, name: c.name })
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
          const totalCount = Array.from(byPos.values()).reduce((n, g) => n + g.entries.length, 0)
          const posEntries = Array.from(byPos.entries())

          return (
            <div key={stage}>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[label] ?? 'bg-gray-100 text-gray-700'}`}>
                {label} ({totalCount})
              </span>
              <div className="mt-2 ml-2 space-y-1.5">
                {posEntries.map(([posTitle, group]) => (
                  <div key={posTitle} className="text-sm">
                    <span className="text-gray-500 mr-1">•</span>
                    <Link href={`/positions/${group.posId}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-800 hover:underline underline-offset-2">{posTitle}</Link>
                    <span className="text-gray-500"> ({group.entries.length}):</span>{' '}
                    <span className="text-gray-700">
                      {group.entries.map((e, i) => (
                        <span key={e.cpId}>{i > 0 && ', '}
                          <Link href={`/positions/${group.posId}/candidates/${e.cpId}`} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-2">{e.name}</Link>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PositionCard({ pos }: { pos: PositionData }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/positions/${pos.id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-base font-semibold text-gray-900 truncate hover:underline underline-offset-2">{pos.title}</Link>
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
                      <span key={c.cpId}>{i > 0 && ', '}
                        <Link href={`/positions/${pos.id}/candidates/${c.cpId}`} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-2">{c.name}</Link>{' '}
                        <AgingBadge days={c.daysInStage} />
                      </span>
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

function ActivityFeed({
  client,
  period,
  setPeriod,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
}: {
  client: string
  period: Period
  setPeriod: (p: Period) => void
  customFrom: string
  setCustomFrom: (s: string) => void
  customTo: string
  setCustomTo: (s: string) => void
}) {
  const [data, setData] = useState<ActivityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!client) return
    setLoading(true); setError(null)
    const { from, to } = periodDates(period, customFrom, customTo)
    try {
      const res = await fetch(`/api/reports/account-status?client=${encodeURIComponent(client)}&mode=activity&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      if (!res.ok) throw new Error('Failed to load')
      setData(await res.json())
    } catch {
      setError('Failed to load activity data')
    } finally {
      setLoading(false)
    }
  }, [client, period, customFrom, customTo])

  useEffect(() => { if (client) load() }, [client, load])

  if (!client) return null

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today',     label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'last7',     label: 'Last 7 days' },
    { key: 'next7',     label: 'Next 7 days' },
    { key: 'custom',    label: 'Custom' },
  ]

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-sm transition-colors ${period === p.key ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <span className="text-sm text-gray-500">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              onClick={load}
              className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Apply
            </button>
          </div>
        )}
        {loading && <span className="text-sm text-gray-400">Loading…</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && !loading && (
        data.days.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-8 py-12 text-center">
            <p className="text-gray-500 text-sm">No interview activity in this period.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.days.map((day) => (
              <div key={day.date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-900">{fmtDate(day.date)}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {day.positions.map((pos) => (
                    <div key={pos.posId} className="px-5 py-3 flex items-start gap-4 flex-wrap">
                      <Link
                        href={`/positions/${pos.posId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-900 hover:underline underline-offset-2 shrink-0 min-w-[160px]"
                      >
                        {pos.title}
                      </Link>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                        {pos.scheduled.map((s) => (
                          <span key={s.stage} className="text-gray-500">{s.stage}: <span className="font-medium text-gray-800">{s.count}</span></span>
                        ))}
                        {pos.decisions.map((d) => (
                          <DecisionBadge key={`${d.decision}|${d.stage}`} decision={d.decision} stage={d.stage} count={d.count} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

export default function AccountStatusPage() {
  const [clients, setClients] = useState<string[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [tab, setTab] = useState<'pipeline' | 'activity'>('pipeline')
  const [pipelineData, setPipelineData] = useState<AccountData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Activity period state lifted up so it survives tab switches
  const [period, setPeriod] = useState<Period>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    fetch('/api/reports/account-status')
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .catch(() => setError('Failed to load client list'))
  }, [])

  const loadPipeline = useCallback(async (client: string) => {
    if (!client) { setPipelineData(null); return }
    setPipelineLoading(true); setError(null)
    try {
      const res = await fetch(`/api/reports/account-status?client=${encodeURIComponent(client)}`)
      if (!res.ok) throw new Error('Failed to load')
      setPipelineData(await res.json())
    } catch {
      setError('Failed to load account data')
    } finally {
      setPipelineLoading(false)
    }
  }, [])

  const handleSelect = (client: string) => {
    setSelectedClient(client)
    setPipelineData(null)
    if (tab === 'pipeline') loadPipeline(client)
  }

  const handleTabChange = (t: 'pipeline' | 'activity') => {
    setTab(t)
    if (t === 'pipeline' && selectedClient && !pipelineData) loadPipeline(selectedClient)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Account Status</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live pipeline view per client</p>
        </div>
        {pipelineData && tab === 'pipeline' && (
          <p className="text-xs text-gray-400 mt-1">
            Last updated: {new Date(pipelineData.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
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
        {pipelineLoading && <span className="text-sm text-gray-400">Loading…</span>}
        {selectedClient && !pipelineLoading && tab === 'pipeline' && (
          <button
            onClick={() => loadPipeline(selectedClient)}
            className="text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
          >
            Refresh
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!selectedClient && !pipelineLoading && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-8 py-16 text-center">
          <p className="text-gray-500 text-sm">Select an account to view its status.</p>
        </div>
      )}

      {selectedClient && (
        <>
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex gap-6">
              {(['pipeline', 'activity'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                  {t === 'pipeline' ? 'Pipeline' : 'Activity Feed'}
                </button>
              ))}
            </nav>
          </div>

          {/* Pipeline tab */}
          {tab === 'pipeline' && (
            pipelineData && !pipelineLoading ? (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-wrap gap-6">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Account</p>
                    <p className="text-lg font-semibold text-gray-900 mt-0.5">{pipelineData.client}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Open Positions</p>
                    <p className="text-lg font-semibold text-gray-900 mt-0.5">{pipelineData.totalPositions}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Candidates</p>
                    <p className="text-lg font-semibold text-green-700 mt-0.5">{pipelineData.totalActive}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Not Moving Forward</p>
                    <p className="text-lg font-semibold text-gray-400 mt-0.5">{pipelineData.totalNotMoving}</p>
                  </div>
                </div>

                {pipelineData.positions.length === 0 ? (
                  <p className="text-sm text-gray-500">No open positions for this account.</p>
                ) : (
                  <>
                    {pipelineData.positions.length > 1 && (
                      <CrossPositionSummary positions={pipelineData.positions} />
                    )}
                    {pipelineData.positions.map((pos) => <PositionCard key={pos.id} pos={pos} />)}
                  </>
                )}
              </div>
            ) : pipelineLoading ? null : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-8 py-16 text-center">
                <p className="text-gray-500 text-sm">Loading pipeline data…</p>
              </div>
            )
          )}

          {/* Activity Feed tab */}
          {tab === 'activity' && (
            <ActivityFeed
              client={selectedClient}
              period={period}
              setPeriod={setPeriod}
              customFrom={customFrom}
              setCustomFrom={setCustomFrom}
              customTo={customTo}
              setCustomTo={setCustomTo}
            />
          )}
        </>
      )}
    </div>
  )
}
