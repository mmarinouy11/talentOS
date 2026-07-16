'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AddCandidateToPositionModal } from './AddCandidateToPositionModal'
import type { Stage, CandidateStatus } from '@prisma/client'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

// Lower number = more advanced stage = sorts first in ascending order
const STAGE_ORDER: Record<string, number> = {
  HIRED: 0,
  OFFER: 1,
  CLIENT_INTERVIEW: 2,
  MANAGER_INTERVIEW: 3,
  TECHNICAL_INTERVIEW: 4,
  SCREENING: 5,
  APPLIED: 6,
  REJECTED: 7,
}

type SortDir = 'asc' | 'desc'
type SortKey = 'name' | 'email' | 'seniority' | 'stage' | 'fitScore'

function SortableHeader({
  label,
  active,
  direction,
  onClick,
  className = 'text-left',
}: {
  label: string
  active: boolean
  direction: SortDir
  onClick: () => void
  className?: string
}) {
  return (
    <th
      onClick={onClick}
      className={`${className} px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100 hover:text-gray-900 transition-colors`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? direction === 'asc'
            ? <ChevronUp size={14} className="text-gray-700" />
            : <ChevronDown size={14} className="text-gray-700" />
          : <ChevronsUpDown size={14} className="text-gray-300" />
        }
      </span>
    </th>
  )
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-yellow-600'
  if (score >= 50) return 'text-orange-600'
  return 'text-red-600'
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-400 inline" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

type InterviewStatus = 'PENDING' | 'AWAITING_SCHEDULE' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
type InterviewDecision = 'ADVANCE' | 'REJECT' | 'HOLD'

const ROUND_STATUS_COLORS: Record<InterviewStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  AWAITING_SCHEDULE: 'bg-amber-100 text-amber-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const ROUND_STATUS_LABELS: Record<InterviewStatus, string> = {
  PENDING: 'Pending',
  AWAITING_SCHEDULE: 'Awaiting Schedule',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const DECISION_COLORS: Record<InterviewDecision, string> = {
  ADVANCE: 'bg-green-100 text-green-700',
  REJECT: 'bg-red-100 text-red-700',
  HOLD: 'bg-amber-100 text-amber-700',
}

const DECISION_LABELS: Record<InterviewDecision, string> = {
  ADVANCE: 'Advance',
  REJECT: 'Reject',
  HOLD: 'Hold',
}

interface CandidatePosition {
  id: string
  stage: Stage
  status: CandidateStatus
  fitScore: number | null
  latestInterviewStatus?: string | null
  latestInterviewDecision?: string | null
  compensationOutOfRange?: boolean
  candidate: {
    id: string
    firstName: string
    lastName: string
    email: string
    country: string | null
    seniority: string | null
  }
}

interface Props {
  positionId: string
  candidatePositions: CandidatePosition[]
  activeCandidates: number
  currentUserId?: string
}

export function PositionCandidatesPanel({ positionId, candidatePositions: initial, activeCandidates, currentUserId }: Props) {
  const [rows, setRows] = useState<CandidatePosition[]>(initial)
  const [showModal, setShowModal] = useState(false)
  const [liveScores, setLiveScores] = useState<Record<string, number | null>>({})
  const [scoringIds, setScoringIds] = useState<Set<string>>(new Set())
  const [inactiveExpanded, setInactiveExpanded] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('stage')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const startPolling = useCallback((cpId: string) => {
    setScoringIds((prev) => new Set([...prev, cpId]))
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/candidate-positions/${cpId}`)
        if (!res.ok) { clearInterval(interval); return }
        const data = await res.json()
        if (data.fitScore != null) {
          clearInterval(interval)
          setLiveScores((prev) => ({ ...prev, [cpId]: data.fitScore }))
          setScoringIds((prev) => { const next = new Set(prev); next.delete(cpId); return next })
        }
      } catch { clearInterval(interval) }
    }, 3000)
    setTimeout(() => clearInterval(interval), 120_000)
  }, [])

  function handleCandidateAdded(newRow: CandidatePosition) {
    setRows((prev) => [...prev, newRow])
    startPolling(newRow.id)
  }

  async function handleRemove(cpId: string, name: string) {
    if (!confirm(`Remove ${name} from this position?`)) return
    const res = await fetch(`/api/candidate-positions/${cpId}`, { method: 'DELETE' })
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== cpId))
  }

  const existingCandidateIds = new Set(rows.map((cp) => cp.candidate.id))

  function roundReadiness(cp: CandidatePosition): number {
    const status = cp.latestInterviewStatus
    const decision = cp.latestInterviewDecision
    if (!status) return 8 // NO_ROUND
    if (status === 'COMPLETED') {
      if (decision === 'ADVANCE') return 0
      if (!decision) return 1
      if (decision === 'HOLD') return 2
      if (decision === 'REJECT') return 6
    }
    if (status === 'SCHEDULED') return 3
    if (status === 'AWAITING_SCHEDULE') return 4
    if (status === 'PENDING') return 5
    if (status === 'CANCELLED') return 7
    return 8
  }

  function sortRows(list: CandidatePosition[]) {
    return [...list].sort((a, b) => {
      let av: number | string | null = null
      let bv: number | string | null = null

      if (sortKey === 'name') {
        av = `${a.candidate.firstName} ${a.candidate.lastName}`
        bv = `${b.candidate.firstName} ${b.candidate.lastName}`
      } else if (sortKey === 'email') {
        av = a.candidate.email
        bv = b.candidate.email
      } else if (sortKey === 'seniority') {
        av = a.candidate.seniority ?? ''
        bv = b.candidate.seniority ?? ''
      } else if (sortKey === 'stage') {
        av = STAGE_ORDER[a.stage] ?? 8
        bv = STAGE_ORDER[b.stage] ?? 8
        if (av === bv) {
          // Secondary: round readiness
          const rDiff = roundReadiness(a) - roundReadiness(b)
          if (rDiff !== 0) return rDiff
          // Tertiary: fitScore desc
          const aFit = liveScores[a.id] ?? a.fitScore ?? -1
          const bFit = liveScores[b.id] ?? b.fitScore ?? -1
          return bFit - aFit
        }
      } else if (sortKey === 'fitScore') {
        av = liveScores[a.id] ?? a.fitScore ?? -1
        bv = liveScores[b.id] ?? b.fitScore ?? -1
      }

      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }

  const { activeRows, inactiveRows } = useMemo(() => {
    const active = rows.filter((cp) => cp.status === 'ACTIVE' || cp.status === 'HIRED')
    const inactive = rows.filter((cp) => cp.status === 'REJECTED' || cp.status === 'WITHDRAWN')
    return { activeRows: sortRows(active), inactiveRows: sortRows(inactive) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, liveScores])

  function fitCell(cp: CandidatePosition) {
    if (liveScores[cp.id] != null) {
      const score = liveScores[cp.id]!
      return <span className={`font-medium ${scoreColor(score)}`}>{Math.round(score)}</span>
    }
    if (scoringIds.has(cp.id)) return <Spinner />
    if (cp.fitScore != null) {
      return <span className={`font-medium ${scoreColor(cp.fitScore)}`}>{Math.round(cp.fitScore)}</span>
    }
    return <span className="text-gray-400">—</span>
  }

  function sh(label: string, key: SortKey, className?: string) {
    return <SortableHeader label={label} active={sortKey === key} direction={sortDir} onClick={() => toggleSort(key)} className={className} />
  }

  function renderRow(cp: CandidatePosition) {
    return (
      <tr key={cp.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { window.location.href = `/positions/${positionId}/candidates/${cp.id}` }}>
        <td className="px-4 py-3 font-medium text-gray-900">
          <Link href={`/positions/${positionId}/candidates/${cp.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {cp.candidate.firstName} {cp.candidate.lastName}
          </Link>
          {cp.compensationOutOfRange && (
            <span className="ml-1.5 text-red-600" title="Compensation out of range">💰</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-600">{cp.candidate.email}</td>
        <td className="px-4 py-3 text-gray-600">{cp.candidate.country ?? '—'}</td>
        <td className="px-4 py-3 text-gray-600">{cp.candidate.seniority ?? '—'}</td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {STAGE_LABELS[cp.stage]}
          </span>
        </td>
        <td className="px-4 py-3">
          {cp.latestInterviewStatus ? (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROUND_STATUS_COLORS[cp.latestInterviewStatus as InterviewStatus] ?? 'bg-gray-100 text-gray-700'}`}>
                {ROUND_STATUS_LABELS[cp.latestInterviewStatus as InterviewStatus] ?? cp.latestInterviewStatus}
              </span>
              {cp.latestInterviewDecision && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_COLORS[cp.latestInterviewDecision as InterviewDecision] ?? 'bg-gray-100 text-gray-700'}`}>
                  {DECISION_LABELS[cp.latestInterviewDecision as InterviewDecision] ?? cp.latestInterviewDecision}
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">{fitCell(cp)}</td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={(e) => { e.stopPropagation(); handleRemove(cp.id, `${cp.candidate.firstName} ${cp.candidate.lastName}`) }}
            className="text-gray-400 hover:text-red-600 transition-colors"
            title="Remove from position"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </td>
      </tr>
    )
  }

  const thead = (
    <thead>
      <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
        {sh('Name', 'name')}
        {sh('Email', 'email')}
        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Country</th>
        {sh('Seniority', 'seniority')}
        {sh('Stage', 'stage')}
        <th className="px-4 py-3 text-left font-medium text-gray-600">Round Status</th>
        {sh('Fit', 'fitScore', 'text-right')}
        <th className="px-4 py-3" />
      </tr>
    </thead>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-900">Candidates ({rows.length})</span>
          <span className="ml-4 text-sm text-gray-500">{activeCandidates} active</span>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}>Add Candidate</Button>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No candidates yet.</div>
      ) : (
        <div>
          {/* Active group */}
          <div className="px-6 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Active ({activeRows.length})
            </span>
          </div>
          {activeRows.length === 0 ? (
            <div className="px-6 py-4 text-sm text-gray-400">No active candidates.</div>
          ) : (
            <table className="w-full text-sm">
              {thead}
              <tbody className="divide-y divide-gray-50">
                {activeRows.map(renderRow)}
              </tbody>
            </table>
          )}

          {/* Not Moving Forward group */}
          {inactiveRows.length > 0 && (
            <div className="border-t border-gray-200">
              <button
                className="w-full px-6 py-2 bg-gray-50 flex items-center gap-2 hover:bg-gray-100 transition-colors text-left"
                onClick={() => setInactiveExpanded((v) => !v)}
              >
                {inactiveExpanded
                  ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                  : <ChevronUp size={14} className="text-gray-400 shrink-0 rotate-180" />
                }
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Not Moving Forward ({inactiveRows.length})
                </span>
              </button>
              {inactiveExpanded && (
                <table className="w-full text-sm">
                  {thead}
                  <tbody className="divide-y divide-gray-50">
                    {inactiveRows.map(renderRow)}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <AddCandidateToPositionModal
          positionId={positionId}
          existingCandidateIds={existingCandidateIds}
          currentUserId={currentUserId}
          onCandidateAdded={handleCandidateAdded}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
