'use client'

import { useState } from 'react'
import { CandidatesTable } from '@/components/app/CandidatesTable'
import type { CandidateRow } from '@/components/app/CandidatesTable'

type StatusFilter = 'active' | 'hired' | 'rejected' | ''

interface CardProps {
  label: string
  count: number
  color: string
  filterValue: StatusFilter
  active: boolean
  onClick: (v: StatusFilter) => void
}

function StatusCard({ label, count, color, filterValue, active, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(filterValue)}
      className={`text-left w-full bg-white rounded-xl px-5 py-4 transition-all cursor-pointer focus:outline-none ${
        active
          ? 'border-2 border-[#8CF000] shadow-sm'
          : 'border border-t-[2px] border-t-[#8CF000] border-gray-200 hover:border-gray-300'
      }`}
    >
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-semibold mt-1 ${color}`}>{count}</p>
    </button>
  )
}

interface Props {
  candidates: CandidateRow[]
  counts: { total: number; active: number; hired: number; rejected: number }
}

export function CandidatesDashboard({ candidates, counts }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')

  function handleCardClick(value: StatusFilter) {
    setStatusFilter((prev) => (prev === value ? '' : value))
  }

  const cards: { label: string; color: string; filterValue: StatusFilter; count: number }[] = [
    { label: 'Total', color: 'text-gray-600', filterValue: '', count: counts.total },
    { label: 'Active', color: 'text-blue-600', filterValue: 'active', count: counts.active },
    { label: 'Hired', color: 'text-green-600', filterValue: 'hired', count: counts.hired },
    { label: 'Rejected', color: 'text-red-600', filterValue: 'rejected', count: counts.rejected },
  ]

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        {cards.map((c) => (
          <StatusCard
            key={c.filterValue}
            label={c.label}
            count={c.count}
            color={c.color}
            filterValue={c.filterValue}
            active={statusFilter !== '' && statusFilter === c.filterValue}
            onClick={handleCardClick}
          />
        ))}
      </div>
      <CandidatesTable
        candidates={candidates}
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => setStatusFilter(v as StatusFilter)}
      />
    </>
  )
}
