import Link from 'next/link'
import type { ReactNode } from 'react'
import { HcFraction } from '@/components/app/HcFraction'
import { STAGE_LABELS, STAGE_SHORT_LABELS } from '@/lib/stage-labels'
import {
  DECISION_WAIT_AMBER_BD, DECISION_WAIT_RED_BD, PIPE_AGE_AMBER_DAYS, PIPE_AGE_RED_DAYS, STALLED_AMBER_DAYS, STALLED_RED_DAYS,
} from '@/lib/home-thresholds'
import { SNAPSHOT_STAGES, type HomeData, type TodayInterview, type WaitingItem } from '@/lib/home'
import { CollapsedRows, ExpandableRow, LimitedRows } from './HomeToggles'

// ─── Formatting ─────────────────────────────────────────────────────────────

function fmtTime(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short' })
}
function fmtDate(iso: string, timeZone: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })
}

function urgencyClass(value: number, amber: number, red: number) {
  if (value >= red) return 'text-red-600 font-semibold'
  if (value >= amber) return 'text-amber-600 font-medium'
  return 'text-gray-500'
}
const waitClass = (bd: number) => urgencyClass(bd, DECISION_WAIT_AMBER_BD, DECISION_WAIT_RED_BD)
const stalledClass = (d: number) => urgencyClass(d, STALLED_AMBER_DAYS, STALLED_RED_DAYS)
const pipeAgeClass = (d: number) => urgencyClass(d, PIPE_AGE_AMBER_DAYS, PIPE_AGE_RED_DAYS)

const SOURCE_LABELS: Record<string, string> = { VENDOR: 'Partner', REFERRAL: 'Referral', DIRECT: 'Direct apply' }

// ─── Building blocks ────────────────────────────────────────────────────────

const th = 'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap'
const td = 'px-3 py-2 align-top'
const LIST_LIMIT = 5
const tr = 'hover:bg-[#F5F0EB] transition-colors'
const candHref = (positionId: string, cpId: string) => `/positions/${positionId}/candidates/${cpId}`

function Table({ headers, children }: { headers: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b-[2px] border-b-[#8CF000]">
            {headers.map((h, i) => <th key={i} className={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

function Group({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">
        {title} <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{count}</span>
      </h3>
      {count === 0 ? <p className="text-sm text-gray-400">{empty}</p> : children}
    </div>
  )
}

// Candidate name: never wraps word by word; at most two lines
function CandCell({ positionId, cpId, name }: { positionId: string; cpId: string; name: string }) {
  return (
    <Link href={candHref(positionId, cpId)} title={name} className="block min-w-[9rem] max-w-[14rem] line-clamp-2 font-medium text-gray-900 hover:underline">
      {name}
    </Link>
  )
}

function PosCell({ title, client }: { title: string; client: string }) {
  return (
    <div className="min-w-[8rem] max-w-[220px]">
      <p className="text-gray-700 truncate" title={title}>{title}</p>
      <p className="text-xs text-gray-400 truncate" title={client}>{client}</p>
    </div>
  )
}

function WaitingTable({ items }: { items: WaitingItem[] }) {
  return (
    <Table headers={['Candidate', 'Position', 'Stage', 'Interview', 'Waiting', 'Interviewer']}>
      {items.map((w) => (
        <tr key={w.interviewId} className={tr}>
          <td className={td}><CandCell positionId={w.positionId} cpId={w.cpId} name={w.candidateName} /></td>
          <td className={td}><PosCell title={w.positionTitle} client={w.client} /></td>
          <td className={`${td} text-gray-600 whitespace-nowrap`}>{STAGE_LABELS[w.stage] ?? w.stage}</td>
          <td className={`${td} text-gray-500 whitespace-nowrap`}>{fmtDate(w.scheduledAt, w.timezone)}</td>
          <td className={`${td} whitespace-nowrap ${waitClass(w.businessDaysWaiting)}`}>{w.businessDaysWaiting} bd</td>
          <td className={`${td} text-xs text-gray-500 max-w-[12rem] truncate`} title={w.interviewerEmail ?? undefined}>{w.interviewerEmail ?? '—'}</td>
        </tr>
      ))}
    </Table>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 min-w-0">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

function Counter({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 border-t-[2px] border-t-[#8CF000] bg-white px-4 py-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-0.5 ${highlight && value > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

// One line per interview: time, candidate, position, stage, interviewer
function InterviewRow({ i }: { i: TodayInterview }) {
  const nw = 'px-3 py-1.5 whitespace-nowrap'
  return (
    <tr className={`${tr} ${i.done ? 'text-gray-400' : ''}`}>
      <td className={`${nw} font-medium tabular-nums ${i.done ? 'text-gray-400' : 'text-gray-900'}`}>{fmtTime(i.scheduledAt, i.timezone)}</td>
      <td className={nw}>
        <Link href={candHref(i.positionId, i.cpId)} title={i.candidateName} className="block max-w-[9rem] truncate font-medium text-gray-900 hover:underline">{i.candidateName}</Link>
      </td>
      <td className={`${nw} text-gray-600`}><span className="block max-w-[10rem] truncate" title={`${i.positionTitle} · ${i.client}`}>{i.positionTitle}</span></td>
      <td className={`${nw} text-gray-600`}>{STAGE_SHORT_LABELS[i.stage] ?? i.stage}</td>
      <td className={`${nw} text-xs text-gray-500`}>
        <span className="block max-w-[9rem] truncate" title={i.interviewerEmail ?? undefined}>{i.interviewerEmail ?? '—'}</span>
      </td>
      <td className={`${nw} text-xs`}>
        {i.done ? <span className="text-[#2F2C29] font-medium">✓</span> : i.isPast ? <span className="text-amber-600" title="No decision yet">◐</span> : null}
      </td>
    </tr>
  )
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export function HomeScreen({ data }: { data: HomeData }) {
  const waitingCount = data.waiting.internal.length + data.waiting.client.length
  const stalledCandidates = data.stalled.reduce((n, g) => n + g.count, 0)
  const maxAvg = Math.max(...data.bottlenecks.map((b) => b.avgDays ?? -1))
  // Upcoming and past-without-decision first; interviews decided today collapse at the bottom
  const openInterviews = data.todayInterviews.filter((i) => !i.done)
  const decidedInterviews = data.todayInterviews.filter((i) => i.done)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Today — {data.today.label}</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Counter label="Open headcount" value={data.counters.openHeadcount} />
          <Counter label="Active candidates" value={data.counters.activeCandidates} />
          <Counter label="Interviews today" value={data.counters.interviewsToday} />
          <Counter label="Need attention" value={data.counters.needsAttention} highlight />
        </div>
      </div>

      {/* Two columns on desktop: needs attention (≈60%) | today + bottlenecks (≈40%) */}
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3 min-w-0">
          <Section title="Needs attention">
            <div className="space-y-6">
              <Group title="Waiting for a decision" count={waitingCount} empty="Nothing waiting">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Internal panel ({data.waiting.internal.length})</p>
                    {data.waiting.internal.length === 0
                      ? <p className="text-sm text-gray-400">Nothing waiting</p>
                      : <WaitingTable items={data.waiting.internal} />}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client / hiring manager ({data.waiting.client.length})</p>
                    {data.waiting.client.length === 0
                      ? <p className="text-sm text-gray-400">Nothing waiting</p>
                      : <WaitingTable items={data.waiting.client} />}
                  </div>
                </div>
              </Group>

              <Group title="Stalled candidates" count={stalledCandidates} empty="No stalled candidates">
                <Table headers={['Position', 'Stalled', 'Oldest', '']}>
                  <LimitedRows
                    limit={LIST_LIMIT}
                    colSpan={4}
                    rows={data.stalled.map((g) => (
                      <ExpandableRow
                        key={g.positionId}
                        colSpan={4}
                        cells={<>
                          <td className={td}><PosCell title={g.positionTitle} client={g.client} /></td>
                          <td className={td}>
                            <span className="font-medium text-gray-900">{g.count}</span>
                            <span className="ml-1.5 text-xs text-gray-500">
                              {g.byStage.map((b) => `${b.count} ${STAGE_SHORT_LABELS[b.stage] ?? b.stage}`).join(' · ')}
                            </span>
                          </td>
                          <td className={`${td} whitespace-nowrap ${stalledClass(g.oldestDays)}`}>{g.oldestDays}d</td>
                        </>}
                        detail={
                          <ul className="divide-y divide-gray-100">
                            {g.candidates.map((c) => (
                              <li key={c.cpId} className="flex items-center gap-3 py-1.5 text-sm">
                                <CandCell positionId={c.positionId} cpId={c.cpId} name={c.candidateName} />
                                <span className="text-gray-600 whitespace-nowrap">{STAGE_LABELS[c.stage] ?? c.stage}</span>
                                <span className={`ml-auto whitespace-nowrap ${stalledClass(c.daysInStage)}`}>{c.daysInStage}d</span>
                              </li>
                            ))}
                          </ul>
                        }
                      />
                    ))}
                  />
                </Table>
              </Group>

              <Group title="New applications not reviewed" count={data.newApplications.length} empty="No new applications">
                <Table headers={['Candidate', 'Position', 'Source', 'Added']}>
                  <LimitedRows
                    limit={LIST_LIMIT}
                    colSpan={4}
                    rows={data.newApplications.map((a) => (
                      <tr key={a.cpId} className={tr}>
                        <td className={td}><CandCell positionId={a.positionId} cpId={a.cpId} name={a.candidateName} /></td>
                        <td className={td}><PosCell title={a.positionTitle} client={a.client} /></td>
                        <td className={`${td} text-gray-600 whitespace-nowrap`}>{SOURCE_LABELS[a.source]}</td>
                        <td className={`${td} text-gray-500 whitespace-nowrap`}>{a.daysSinceAdded === 0 ? 'Today' : `${a.daysSinceAdded}d ago`}</td>
                      </tr>
                    ))}
                  />
                </Table>
              </Group>

              <Group title="Starting soon" count={data.startingSoon.length} empty="No starts in the next 7 days">
                <Table headers={['Candidate', 'Position', 'Start date']}>
                  <LimitedRows
                    limit={LIST_LIMIT}
                    colSpan={3}
                    rows={data.startingSoon.map((s) => (
                      <tr key={s.cpId} className={tr}>
                        <td className={td}><CandCell positionId={s.positionId} cpId={s.cpId} name={s.candidateName} /></td>
                        <td className={td}><PosCell title={s.positionTitle} client={s.client} /></td>
                        <td className={`${td} text-gray-700 whitespace-nowrap`}>{fmtDate(s.startDate, 'UTC')}</td>
                      </tr>
                    ))}
                  />
                </Table>
              </Group>
            </div>
          </Section>
        </div>

        <div className="lg:col-span-2 min-w-0 space-y-8">
          <Section title="Today's interviews">
            {data.todayInterviews.length === 0 ? <p className="text-sm text-gray-400">No interviews today</p> : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b-[2px] border-b-[#8CF000]">
                      {['Time', 'Candidate', 'Position', 'Stage', 'Interviewer', ''].map((h, k) => <th key={k} className={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {openInterviews.map((i) => <InterviewRow key={i.interviewId} i={i} />)}
                    <CollapsedRows
                      colSpan={6}
                      label={`${decidedInterviews.length} already decided`}
                      rows={decidedInterviews.map((i) => <InterviewRow key={i.interviewId} i={i} />)}
                    />
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Bottlenecks">
            <Table headers={['Stage', 'Active', 'Avg in stage', `Over ${STALLED_AMBER_DAYS}d`]}>
              {data.bottlenecks.map((b) => {
                const worst = b.avgDays != null && b.avgDays === maxAvg && maxAvg > 0
                return (
                  <tr key={b.stage} className={`${tr} ${worst ? 'bg-amber-50' : ''}`}>
                    <td className={`${td} font-medium text-gray-900 whitespace-nowrap`}>
                      {STAGE_LABELS[b.stage] ?? b.stage}
                      {worst && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">slowest</span>}
                    </td>
                    <td className={`${td} tabular-nums text-gray-700`}>{b.active || '—'}</td>
                    <td className={`${td} tabular-nums ${b.avgDays != null ? stalledClass(b.avgDays) : 'text-gray-300'}`}>{b.avgDays != null ? `${b.avgDays}d` : '—'}</td>
                    <td className={`${td} tabular-nums ${b.overThreshold > 0 ? 'text-amber-600 font-medium' : 'text-gray-300'}`}>{b.overThreshold || '—'}</td>
                  </tr>
                )
              })}
            </Table>
          </Section>
        </div>
      </div>

      {/* Open positions — full width below both columns */}
      <Section title="Open positions">
        {data.snapshot.length === 0 ? <p className="text-sm text-gray-400">No open positions</p> : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b-[2px] border-b-[#8CF000]">
                  <th className={th}>Position</th>
                  {SNAPSHOT_STAGES.map((s) => <th key={s} className={`${th} text-center`}>{STAGE_SHORT_LABELS[s]}</th>)}
                  <th className={`${th} text-center`}>Pipe age</th>
                  <th className={`${th} text-center`}>Oldest wait</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshot.map((group) => (
                  <ClientRows key={group.client} group={group} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function ClientRows({ group }: { group: HomeData['snapshot'][number] }) {
  return (
    <>
      <tr>
        <td colSpan={SNAPSHOT_STAGES.length + 3} className="bg-gray-50 border-l-[3px] border-l-[#8CF000] px-3 py-1.5 text-xs font-bold text-gray-700">
          {group.client}
        </td>
      </tr>
      {group.positions.map((p) => (
        <tr key={p.positionId} className={`${tr} border-b border-gray-100`}>
          <td className={td}>
            <Link href={`/positions/${p.positionId}`} className="block min-w-[10rem] font-medium text-gray-900 hover:underline">{p.title}</Link>
            <div className="text-xs mt-0.5"><HcFraction hired={p.hired} headcount={p.headcount} /></div>
          </td>
          {SNAPSHOT_STAGES.map((s) => (
            <td key={s} className={`${td} text-center tabular-nums ${p.stageCounts[s] ? 'text-gray-900' : 'text-gray-300'}`}>
              {p.stageCounts[s] || '—'}
            </td>
          ))}
          <td className={`${td} text-center tabular-nums whitespace-nowrap ${p.pipeAgeDays != null ? pipeAgeClass(p.pipeAgeDays) : 'text-gray-300'}`}>
            {p.pipeAgeDays != null ? `${p.pipeAgeDays}d` : '—'}
          </td>
          <td className={`${td} text-center tabular-nums whitespace-nowrap ${p.oldestWaitBd != null ? waitClass(p.oldestWaitBd) : 'text-gray-300'}`}>
            {p.oldestWaitBd != null ? `${p.oldestWaitBd} bd` : '—'}
          </td>
        </tr>
      ))}
    </>
  )
}
