'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft } from 'lucide-react'

type Period = 'week' | 'month' | '30d' | '90d' | 'custom'

interface RecruiterMetrics {
  id: string
  name: string | null
  email: string
  role: string
  manual: number
  direct: number
  partner: number
  interviewsScheduled: number
  screeningHrsPerDay: number
  advances: number
  rejects: number
  advanceRate: number | null
  avgFitScore: number | null
  activePositions: number
  daysToScreeningDone: number | null
  positions: { id: string; title: string; client: string; count: number; avgFitScore: number | null }[]
  dailySourcing: Record<string, number>
}

type SortKey = keyof Pick<RecruiterMetrics,
  'manual' | 'direct' | 'partner' | 'activePositions' | 'interviewsScheduled' |
  'screeningHrsPerDay' | 'daysToScreeningDone' | 'advances' | 'rejects' |
  'advanceRate' | 'avgFitScore'
> | 'name'

function getDateRange(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = fmt(now)

  if (period === 'week') {
    const day = now.getDay() || 7
    const mon = new Date(now)
    mon.setDate(now.getDate() - day + 1)
    return { from: fmt(mon), to: today }
  }
  if (period === 'month') {
    return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: today }
  }
  if (period === '30d') {
    const d = new Date(now); d.setDate(d.getDate() - 30)
    return { from: fmt(d), to: today }
  }
  if (period === '90d') {
    const d = new Date(now); d.setDate(d.getDate() - 90)
    return { from: fmt(d), to: today }
  }
  return { from: customFrom, to: customTo }
}

function SortableHeader({
  label, col, sortKey, sortDir, onSort, className = 'text-right', tooltip,
}: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc'
  onSort: (k: SortKey) => void; className?: string; tooltip?: string
}) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)} className={`${className} px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap`}>
      <span className="inline-flex items-center gap-1 justify-end w-full">
        {label}
        {tooltip && (
          <span className="relative group/tip">
            <span className="text-gray-300 cursor-help">ⓘ</span>
            <span className="absolute bottom-full right-0 mb-1.5 w-48 bg-gray-800 text-white text-xs rounded px-2 py-1.5 leading-snug opacity-0 group-hover/tip:opacity-100 pointer-events-none z-20 whitespace-normal font-normal normal-case tracking-normal">
              {tooltip}
            </span>
          </span>
        )}
        {active ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} /> : <ChevronsUpDown size={12} className="text-gray-300" />}
      </span>
    </th>
  )
}

function MiniBarChart({ data, from, to }: { data: Record<string, number>; from: string; to: string }) {
  const days = (() => {
    const result = []
    const cur = new Date(from + 'T00:00:00')
    const end = new Date(to + 'T00:00:00')
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10)
      result.push({ key, label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: data[key] ?? 0 })
      cur.setDate(cur.getDate() + 1)
    }
    return result
  })()
  const max = Math.max(...days.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-16">
      {days.map((d) => (
        <div key={d.key} className="flex-1 flex flex-col items-center group relative">
          <div
            className="w-full bg-[#8DF000] rounded-sm transition-all"
            style={{ height: `${Math.max(2, (d.count / max) * 56)}px`, opacity: d.count === 0 ? 0.15 : 1 }}
          />
          {d.count > 0 && (
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
              {d.label}: {d.count}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function fmt(v: number | null, suffix = '') {
  if (v == null) return <span className="text-gray-300">—</span>
  return <span>{v}{suffix}</span>
}

export default function RecruiterPerformancePage() {
  const router = useRouter()
  const [period, setPeriod] = useState<Period>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [metrics, setMetrics] = useState<RecruiterMetrics[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('manual')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { from, to } = getDateRange(period, customFrom, customTo)

  const fetchData = useCallback(async () => {
    if (period === 'custom' && (!customFrom || !customTo)) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/reports/recruiter-performance?from=${from}&to=${to}`)
      if (res.status === 403) { router.replace('/reports'); return }
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      setMetrics(data.metrics)
    } catch {
      setError('Failed to load recruiter performance data.')
    } finally {
      setLoading(false)
    }
  }, [from, to, period, customFrom, customTo, router])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    if (!metrics) return []
    return [...metrics].sort((a, b) => {
      const av = sortKey === 'name' ? (a.name ?? a.email) : (a[sortKey as keyof RecruiterMetrics] as number | null) ?? -1
      const bv = sortKey === 'name' ? (b.name ?? b.email) : (b[sortKey as keyof RecruiterMetrics] as number | null) ?? -1
      if (av == null) return 1; if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [metrics, sortKey, sortDir])

  const totals = useMemo(() => {
    if (!metrics) return null
    return metrics.reduce((acc, r) => ({
      manual: acc.manual + r.manual,
      direct: acc.direct + r.direct,
      partner: acc.partner + r.partner,
      activePositions: acc.activePositions + r.activePositions,
      interviewsScheduled: acc.interviewsScheduled + r.interviewsScheduled,
      advances: acc.advances + r.advances,
      rejects: acc.rejects + r.rejects,
    }), { manual: 0, direct: 0, partner: 0, activePositions: 0, interviewsScheduled: 0, advances: 0, rejects: 0 })
  }, [metrics])

  const sh = (label: string, col: SortKey, tooltip?: string) => (
    <SortableHeader label={label} col={col} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} tooltip={tooltip} />
  )

  const PERIODS: { value: Period; label: string }[] = [
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: 'custom', label: 'Custom' },
  ]

  // columns: Recruiter | Active Pos. | Manual | Direct | Partner | Int. Scheduled | Daily Screen. | Days to Screen. | Advances | Rejects | Adv% | Avg Fit | [expand]
  // = 13 columns
  const DECISION_TOOLTIP = 'Based on screening stage decisions only'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-gray-400 hover:text-gray-700">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Recruiter Performance</h1>
          <p className="text-sm text-gray-500 mt-0.5">Admin only · per-recruiter activity metrics</p>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${period === p.value ? 'bg-[#8DF000] border-[#8DF000] text-gray-900 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
          >
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#8DF000]" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#8DF000]" />
          </div>
        )}
        {period !== 'custom' && (
          <span className="text-sm text-gray-400 ml-2">{from} → {to}</span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {!loading && metrics && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
                  <SortableHeader label="Recruiter" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap" />
                  {sh('Active Pos.', 'activePositions')}
                  {sh('Manual', 'manual')}
                  {sh('Direct', 'direct')}
                  {sh('Partner', 'partner')}
                  {sh('Int. Scheduled', 'interviewsScheduled')}
                  {sh('Daily Screen. Effort', 'screeningHrsPerDay', 'Estimated based on 30 min per screening call conducted.')}
                  {sh('Days to Screen.', 'daysToScreeningDone', 'Average days from candidate added to screening completed.')}
                  {sh('Advances', 'advances', DECISION_TOOLTIP)}
                  {sh('Rejects', 'rejects', DECISION_TOOLTIP)}
                  {sh('Adv %', 'advanceRate', DECISION_TOOLTIP)}
                  {sh('Avg Fit', 'avgFitScore', 'Average fit score of manually sourced candidates only.')}
                  <th className="px-3 py-3" />
                </tr>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th colSpan={5} className="px-3 py-1 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Sourcing</th>
                  <th colSpan={4} className="px-3 py-1 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Pipeline Activity</th>
                  <th colSpan={3} className="px-3 py-1 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">Quality</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((r) => (
                  <>
                    <tr
                      key={r.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded((prev) => prev === r.id ? null : r.id)}
                    >
                      <td className="px-3 py-3 font-medium text-gray-900">
                        <div>{r.name ?? r.email}</div>
                        {r.name && <div className="text-xs text-gray-400">{r.email}</div>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fmt(r.activePositions)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-gray-900">{fmt(r.manual)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fmt(r.direct)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fmt(r.partner)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fmt(r.interviewsScheduled)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.screeningHrsPerDay > 0 ? `${r.screeningHrsPerDay} hrs/day` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.daysToScreeningDone != null ? `${r.daysToScreeningDone}d` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-green-700">{fmt(r.advances)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-600">{fmt(r.rejects)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fmt(r.advanceRate, '%')}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fmt(r.avgFitScore)}</td>
                      <td className="px-3 py-3 text-gray-400">
                        {expanded === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={13} className="px-4 py-4 bg-gray-50 border-b border-gray-100">
                          <div className="space-y-4">
                            {r.positions.length > 0 ? (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Positions worked on (this period)</p>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-xs text-gray-400 border-b border-gray-200">
                                      <th className="text-left py-1.5 font-medium">Position</th>
                                      <th className="text-left py-1.5 font-medium">Client</th>
                                      <th className="text-right py-1.5 font-medium">Candidates Added</th>
                                      <th className="text-right py-1.5 font-medium">Avg Fit Score</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {r.positions.map((p) => (
                                      <tr key={p.id}>
                                        <td className="py-1.5 pr-4">
                                          <Link href={`/positions/${p.id}`} className="text-gray-800 hover:underline">{p.title}</Link>
                                        </td>
                                        <td className="py-1.5 pr-4 text-gray-500">{p.client}</td>
                                        <td className="py-1.5 text-right text-gray-700">{p.count}</td>
                                        <td className="py-1.5 text-right text-gray-700">{p.avgFitScore ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">No candidates added to positions in this period.</p>
                            )}
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sourcing activity — selected period</p>
                              <MiniBarChart data={r.dailySourcing} from={from} to={to} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Totals</td>
                    <td className="px-3 py-3 text-right tabular-nums">{totals.activePositions}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{totals.manual}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{totals.direct}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{totals.partner}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{totals.interviewsScheduled}</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-right tabular-nums text-green-700">{totals.advances}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-600">{totals.rejects}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {totals.advances + totals.rejects > 0
                        ? `${Math.round((totals.advances / (totals.advances + totals.rejects)) * 100)}%`
                        : '—'}
                    </td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {!loading && metrics && metrics.every((r) => r.manual === 0 && r.interviewsScheduled === 0) && (
        <p className="text-sm text-gray-400 text-center py-8">No recruiter activity recorded for this period.</p>
      )}
    </div>
  )
}
