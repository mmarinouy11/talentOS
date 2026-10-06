'use client'

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronLeft } from 'lucide-react'

type SlaResult = { result: 'met' | 'partial' | 'missed' | 'in_progress' | 'na'; count: number; need: number; windowBd: number; days: number | null }
interface SlaAgg { attainment: number | null; avgDays: number | null; met: number; decided: number; inProgress: number }
interface CandRef { name: string; cpId: string; positionId: string; positionTitle: string }

interface RecruiterKPI {
  id: string
  name: string | null
  email: string
  demand: {
    assignedPositions: number
    positionsWithActivity: number
    openHeadcountAssigned: number
  }
  qualified: { count: number; perActivePosition: number | null; pace: number | null; target: number }
  timeToSubmission: { first: SlaAgg; shortlist: SlaAgg }
  techPassRate: { rate: number | null; advances: number; total: number }
  closures: { count: number; target: number; stretch: number; isLowDemand: boolean; isNA: boolean }
  achievement: {
    score: number | null
    naKpis: string[]
    breakdown: { key: string; label: string; weight: number; attainment: number | null; effectiveWeight: number; contribution: number | null }[]
  }
  drillDown: {
    positions: { id: string; title: string; status: string; headcount: number; kickoff: string; firstSLA: SlaResult; shortlistSLA: SlaResult; activityOnly: boolean }[]
    qualifiedCandidates: (CandRef & { date: string })[]
    closuresList: (CandRef & { hireDate: string; startDate: string | null })[]
  }
  activity: {
    manual: number; direct: number; partner: number
    interviewsScheduled: number; screeningHrsPerDay: number
    advances: number; rejects: number; advanceRate: number | null
    avgFitScore: number | null; activePositions: number
    daysToScreeningDone: number | null
    dailySourcing: Record<string, number>
  }
}

interface ReportData {
  month: string
  isCurrentMonth: boolean
  metrics: RecruiterKPI[]
}

type Status = 'met' | 'near' | 'below' | 'na'

function currentMonthStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function monthOptions(): { value: string; label: string }[] {
  const out = []
  const n = new Date()
  for (let i = 0; i < 18; i++) {
    const d = new Date(n.getFullYear(), n.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ value, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })
  }
  return out
}

function ratioStatus(value: number | null, target: number): Status {
  if (value == null) return 'na'
  if (target <= 0) return 'met'
  if (value >= target) return 'met'
  if (value >= target * 0.8) return 'near'
  return 'below'
}

function StatusIcon({ s }: { s: Status }) {
  if (s === 'met') return <span className="text-[#2F2C29] font-medium">✓</span>
  if (s === 'near') return <span className="text-amber-500">◐</span>
  if (s === 'below') return <span className="text-gray-400">○</span>
  return null
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const Dash = () => <span className="text-gray-300">—</span>

function SlaBadge({ sla }: { sla: SlaResult }) {
  if (sla.result === 'na') return <Dash />
  if (sla.need === 1) {
    if (sla.result === 'met') return <span className="text-[#2F2C29] font-medium">✓ met · {sla.days}bd</span>
    if (sla.result === 'in_progress') return <span className="text-amber-500">◐ in progress (≤{sla.windowBd}bd)</span>
    return <span className="text-gray-500">○ missed{sla.days != null ? ` · ${sla.days}bd` : ''}</span>
  }
  const label = `${sla.count} of ${sla.need}`
  if (sla.result === 'met') return <span className="text-[#2F2C29] font-medium">✓ {label} · {sla.windowBd}bd</span>
  if (sla.result === 'in_progress') return <span className="text-amber-500">◐ {label} · in progress</span>
  if (sla.result === 'partial') return <span className="text-amber-500">◐ {label} · {sla.windowBd}bd</span>
  return <span className="text-gray-500">○ {label} · {sla.windowBd}bd</span>
}

function SlaCell({ agg, target }: { agg: SlaAgg; target: number }) {
  if (agg.decided === 0 && agg.inProgress === 0) return <Dash />
  const s: Status = agg.attainment == null ? 'na' : agg.attainment === 100 ? 'met' : agg.attainment >= 80 ? 'near' : 'below'
  return (
    <div>
      <div className="tabular-nums">
        <StatusIcon s={s} /> {agg.attainment != null ? `${agg.attainment}%` : '—'}
        <span className="text-gray-400 text-xs"> · ≤{target}bd</span>
      </div>
      <div className="text-xs text-gray-400">
        {agg.avgDays != null ? `avg ${agg.avgDays}bd` : 'no data'}
        {agg.inProgress > 0 && ` · ${agg.inProgress} in progress`}
      </div>
    </div>
  )
}

function MiniBarChart({ data, month }: { data: Record<string, number>; month: string }) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const days = Array.from({ length: last }, (_, i) => {
    const key = `${month}-${String(i + 1).padStart(2, '0')}`
    return { key, label: `${i + 1}`, count: data[key] ?? 0 }
  })
  const max = Math.max(...days.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-16">
      {days.map((d) => (
        <div key={d.key} className="flex-1 flex flex-col items-center group relative">
          <div className="w-full bg-[#8CF000] rounded-sm" style={{ height: `${Math.max(2, (d.count / max) * 56)}px`, opacity: d.count === 0 ? 0.15 : 1 }} />
          {d.count > 0 && (
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
              Day {d.label}: {d.count}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const th = 'px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap'
const hdrEdge = 'border-b-[2px] border-b-[#8CF000]'
const subTh ='text-left py-1.5 font-medium'

function DrillDown({ r }: { r: RecruiterKPI }) {
  const d = r.drillDown
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Positions (assigned + with activity)</p>
        {d.positions.length === 0 ? <p className="text-sm text-gray-400">No positions.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-200">
                <th className={subTh}>Position</th><th className={subTh}>Status</th><th className={subTh}>HC</th>
                <th className={subTh}>Kickoff</th><th className={subTh}>1st qualified (≤3bd)</th><th className={subTh}>Shortlist (≤5bd)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.positions.map((p) => (
                <tr key={p.id}>
                  <td className="py-1.5 pr-4"><Link href={`/positions/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:underline">{p.title}</Link>
                    {p.activityOnly && <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">activity only</span>}
                  </td>
                  <td className="py-1.5 pr-4 text-gray-500 text-xs">{p.status}</td>
                  <td className="py-1.5 pr-4 text-gray-700">{p.headcount}</td>
                  <td className="py-1.5 pr-4 text-gray-500">{fmtDate(p.kickoff)}</td>
                  <td className="py-1.5 pr-4"><SlaBadge sla={p.firstSLA} /></td>
                  <td className="py-1.5"><SlaBadge sla={p.shortlistSLA} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Qualified this month ({d.qualifiedCandidates.length})</p>
          {d.qualifiedCandidates.length === 0 ? <p className="text-sm text-gray-400">None.</p> : (
            <ul className="space-y-1 text-sm">
              {d.qualifiedCandidates.map((c) => (
                <li key={`${c.cpId}-${c.date}`}>
                  <Link href={`/positions/${c.positionId}/candidates/${c.cpId}`} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:underline">{c.name}</Link>
                  <span className="text-gray-400"> · {c.positionTitle} · {fmtDate(c.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Closures this month ({d.closuresList.length})</p>
          {d.closuresList.length === 0 ? <p className="text-sm text-gray-400">None.</p> : (
            <ul className="space-y-1 text-sm">
              {d.closuresList.map((c) => (
                <li key={`${c.cpId}-${c.hireDate}`}>
                  <Link href={`/positions/${c.positionId}/candidates/${c.cpId}`} target="_blank" rel="noopener noreferrer" className="text-gray-800 hover:underline">{c.name}</Link>
                  <span className="text-gray-400"> · {c.positionTitle} · hired {fmtDate(c.hireDate)}{c.startDate ? ` · starts ${fmtDate(c.startDate)}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Achievement breakdown</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-200">
                <th className={subTh}>KPI</th>
                <th className="text-right py-1.5 font-medium">Attain.</th>
                <th className="text-right py-1.5 font-medium">Weight</th>
                <th className="text-right py-1.5 font-medium">Contrib.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {r.achievement.breakdown.map((b) => (
                <tr key={b.key} className={b.attainment == null ? 'text-gray-400' : 'text-gray-700'}>
                  <td className="py-1.5 pr-2">{b.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{b.attainment != null ? `${b.attainment}%` : 'N/A'}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {b.weight}%
                    {b.attainment != null && b.effectiveWeight !== b.weight && <span className="text-gray-400 text-xs"> → {b.effectiveWeight}%</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{b.contribution != null ? `${b.contribution}` : '—'}</td>
                </tr>
              ))}
              <tr className="font-semibold text-gray-900">
                <td className="py-1.5">Total</td><td /><td />
                <td className="py-1.5 text-right tabular-nums">{r.achievement.score != null ? `${r.achievement.score}%` : 'N/A'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ScorecardRow({ r, isCurrentMonth, open, onToggle }: { r: RecruiterKPI; isCurrentMonth: boolean; open: boolean; onToggle: () => void }) {
  const q = r.qualified
  const qStatus: Status = isCurrentMonth && q.pace != null
    ? (q.count >= q.target ? 'met' : q.pace >= q.target ? 'near' : ratioStatus(q.count, q.target) === 'near' ? 'near' : 'below')
    : ratioStatus(q.count, q.target)
  const t = r.techPassRate
  const c = r.closures
  const a = r.achievement

  return (
    <>
      <tr className="hover:bg-[#F5F0EB] cursor-pointer align-top" onClick={onToggle}>
        <td className="px-3 py-3 font-medium text-gray-900">
          <div>{r.name ?? r.email}</div>
          {r.name && <div className="text-xs text-gray-400 font-normal">{r.email}</div>}
        </td>
        <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.demand.assignedPositions}</td>
        <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.demand.positionsWithActivity}</td>
        <td className="px-3 py-3 text-right tabular-nums text-gray-700 border-r border-gray-100">{r.demand.openHeadcountAssigned}</td>
        <td className="px-3 py-3">
          <div className="tabular-nums">
            <StatusIcon s={qStatus} /> {q.count} / {q.target}
            {isCurrentMonth && q.pace != null && <span className="text-gray-400 text-xs"> · pace {q.pace}</span>}
          </div>
          <div className="text-xs text-gray-400">{q.perActivePosition != null ? `${q.perActivePosition} per active pos.` : 'no active pos.'}</div>
        </td>
        <td className="px-3 py-3"><SlaCell agg={r.timeToSubmission.first} target={3} /></td>
        <td className="px-3 py-3"><SlaCell agg={r.timeToSubmission.shortlist} target={5} /></td>
        <td className="px-3 py-3 tabular-nums">
          {t.rate == null ? <Dash /> : (
            <div>
              <StatusIcon s={ratioStatus(t.rate, 60)} /> {t.rate}%
              <div className="text-xs text-gray-400">{t.advances} of {t.total} · ≥60%</div>
            </div>
          )}
        </td>
        <td className="px-3 py-3 tabular-nums">
          {c.isNA ? <span className="text-gray-400">N/A</span> : (
            <div>
              <StatusIcon s={ratioStatus(c.count, c.target)} /> {c.count} / {c.target}
              {!c.isLowDemand && <span className="text-gray-400 text-xs"> · stretch {c.stretch}</span>}
              {c.isLowDemand && <div className="text-xs text-gray-400">(low demand)</div>}
            </div>
          )}
        </td>
        <td className="px-3 py-3 tabular-nums">
          {a.score == null ? <span className="text-gray-400">N/A</span> : (
            <div>
              <StatusIcon s={a.score >= 90 ? 'met' : a.score >= 70 ? 'near' : 'below'} /> <span className="font-semibold">{a.score}%</span>
              {a.naKpis.length > 0 && <div className="text-xs text-gray-400">N/A: {a.naKpis.join(', ')}</div>}
            </div>
          )}
        </td>
        <td className="px-3 py-3 text-gray-400">{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={11} className="px-4 py-4 bg-gray-50 border-b border-gray-100"><DrillDown r={r} /></td>
        </tr>
      )}
    </>
  )
}

function ActivitySection({ metrics, month }: { metrics: RecruiterKPI[]; month: string }) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const totals = metrics.reduce((acc, r) => ({
    manual: acc.manual + r.activity.manual,
    direct: acc.direct + r.activity.direct,
    partner: acc.partner + r.activity.partner,
    activePositions: acc.activePositions + r.activity.activePositions,
    interviewsScheduled: acc.interviewsScheduled + r.activity.interviewsScheduled,
    advances: acc.advances + r.activity.advances,
    rejects: acc.rejects + r.activity.rejects,
  }), { manual: 0, direct: 0, partner: 0, activePositions: 0, interviewsScheduled: 0, advances: 0, rejects: 0 })

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50">
        <span className="text-sm font-semibold text-gray-900">Activity</span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className={`${th} text-left`}>Recruiter</th>
                <th className={`${th} text-right`}>Active Pos.</th>
                <th className={`${th} text-right`}>Manual</th>
                <th className={`${th} text-right`}>Direct</th>
                <th className={`${th} text-right`}>Partner</th>
                <th className={`${th} text-right`}>Int. Scheduled</th>
                <th className={`${th} text-right`} title="Estimated based on 30 min per screening call conducted.">Daily Screen. Effort</th>
                <th className={`${th} text-right`} title="Average days from candidate added to screening completed.">Days to Screen.</th>
                <th className={`${th} text-right`} title="Screening stage decisions only">Advances</th>
                <th className={`${th} text-right`} title="Screening stage decisions only">Rejects</th>
                <th className={`${th} text-right`}>Adv %</th>
                <th className={`${th} text-right`} title="Manually sourced candidates only">Avg Fit</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {metrics.map((r) => {
                const a = r.activity
                const isOpen = expanded === r.id
                return (
                  <Fragment key={r.id}>
                    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                      <td className="px-3 py-3 font-medium text-gray-900">{r.name ?? r.email}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.activePositions}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">{a.manual}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.direct}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.partner}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.interviewsScheduled}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.screeningHrsPerDay > 0 ? `${a.screeningHrsPerDay} hrs/day` : <Dash />}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.daysToScreeningDone != null ? `${a.daysToScreeningDone}d` : <Dash />}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.advances}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.rejects}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.advanceRate != null ? `${a.advanceRate}%` : <Dash />}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{a.avgFitScore ?? <Dash />}</td>
                      <td className="px-3 py-3 text-gray-400">{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={13} className="px-4 py-4 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Daily sourcing</p>
                          <MiniBarChart data={a.dailySourcing} month={month} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                <td className="px-3 py-3 text-xs text-gray-500 uppercase tracking-wide">Totals</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.activePositions}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.manual}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.direct}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.partner}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.interviewsScheduled}</td>
                <td /><td />
                <td className="px-3 py-3 text-right tabular-nums">{totals.advances}</td>
                <td className="px-3 py-3 text-right tabular-nums">{totals.rejects}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {totals.advances + totals.rejects > 0 ? `${Math.round((totals.advances / (totals.advances + totals.rejects)) * 100)}%` : '—'}
                </td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

export default function RecruiterPerformancePage() {
  const router = useRouter()
  const [month, setMonth] = useState(currentMonthStr)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const options = useMemo(monthOptions, [])

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/reports/recruiter-performance?month=${month}`)
      if (res.status === 403) { router.replace('/reports'); return }
      if (!res.ok) throw new Error('Failed to load')
      setData(await res.json())
    } catch {
      setError('Failed to load recruiter performance data.')
    } finally {
      setLoading(false)
    }
  }, [month, router])

  useEffect(() => { fetchData() }, [fetchData])

  const totals = useMemo(() => data?.metrics.reduce((acc, r) => ({
    qualified: acc.qualified + r.qualified.count,
    closures: acc.closures + r.closures.count,
  }), { qualified: 0, closures: 0 }), [data])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-gray-400 hover:text-gray-700"><ChevronLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Recruiter Performance</h1>
          <p className="text-sm text-gray-500 mt-0.5">Admin only · monthly KPIs vs demand</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Month</label>
        <select
          value={month}
          onChange={(e) => { setMonth(e.target.value); setExpanded(null) }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#8CF000]"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {data?.isCurrentMonth && <span className="text-sm text-gray-400">Month to date</span>}
        {loading && <span className="text-sm text-gray-400">Loading…</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && !loading && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th rowSpan={2} className={`${th} ${hdrEdge} text-left align-bottom`}>Recruiter</th>
                    <th colSpan={3} className={`${th} text-center border-b border-gray-200 border-r border-r-gray-100`}>Demand</th>
                    <th rowSpan={2} className={`${th} ${hdrEdge} text-left align-bottom`}>Qualified · 25%</th>
                    <th colSpan={2} className={`${th} text-center border-b border-gray-200`}>Time to 1st submission · 25%</th>
                    <th rowSpan={2} className={`${th} ${hdrEdge} text-left align-bottom`} title="Passed ÷ (passed + failed) tech evaluations of recruiter-screened candidates, one per candidate">Tech Quality · 20%</th>
                    <th rowSpan={2} className={`${th} ${hdrEdge} text-left align-bottom`}>Closures · 30%</th>
                    <th rowSpan={2} className={`${th} ${hdrEdge} text-left align-bottom`} title="Weighted KPI attainment, each capped at 100%">Achievement</th>
                    <th rowSpan={2} className={`${th} ${hdrEdge}`} />
                  </tr>
                  <tr className="bg-gray-50">
                    <th className={`${th} ${hdrEdge} text-right`} title="Assigned positions open during the month">Assigned</th>
                    <th className={`${th} ${hdrEdge} text-right`} title="Positions with candidate added, interview scheduled or decision in the month">Active</th>
                    <th className={`${th} ${hdrEdge} text-right border-r border-r-gray-100`} title="Headcount of assigned positions minus hired">Open HC</th>
                    <th className={`${th} ${hdrEdge} text-left`}>1st Qualified</th>
                    <th className={`${th} ${hdrEdge} text-left`} title="Partial credit: share of 3 qualified within 5 business days">Shortlist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.metrics.map((r) => (
                    <ScorecardRow
                      key={r.id}
                      r={r}
                      isCurrentMonth={data.isCurrentMonth}
                      open={expanded === r.id}
                      onToggle={() => setExpanded((p) => (p === r.id ? null : r.id))}
                    />
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                      <td className="px-3 py-3 text-xs text-gray-500 uppercase tracking-wide">Totals</td>
                      <td colSpan={3} className="border-r border-gray-100" />
                      <td className="px-3 py-3 tabular-nums">{totals.qualified}</td>
                      <td /><td /><td />
                      <td className="px-3 py-3 tabular-nums">{totals.closures}</td>
                      <td /><td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            <span className="text-[#2F2C29] font-medium">✓</span> target met ·{' '}
            <span className="text-amber-500">◐</span> within 20% of target{data.isCurrentMonth ? ' or on pace' : ''} ·{' '}
            <span className="text-gray-400">○</span> below · bd = business days (Mon–Fri)
          </p>

          <ActivitySection metrics={data.metrics} month={data.month} />
        </>
      )}
    </div>
  )
}
