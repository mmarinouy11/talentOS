'use client'

import { useState } from 'react'
import { PositionsTable } from '@/components/app/PositionsTable'
import type { PositionRow } from '@/components/app/PositionsTable'

type FilterValue = 'OPEN' | 'ON_HOLD' | 'FILLED' | 'YTJ' | 'CLOSED' | 'CANCELLED' | ''

interface StatusCardProps {
  label: string
  count: number
  color: string
  filterValue: FilterValue
  active: boolean
  onClick: (v: FilterValue) => void
}

function StatusCard({ label, count, color, filterValue, active, onClick }: StatusCardProps) {
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
  positions: PositionRow[]
  isAdmin: boolean
  counts: {
    OPEN: number; ON_HOLD: number; FILLED: number; CLOSED: number; CANCELLED: number
    ytjCount: number
  }
  headcounts: {
    OPEN: number; ON_HOLD: number; FILLED: number; CLOSED: number; CANCELLED: number
    ytj: number
  }
}

export function PositionsDashboard({ positions, isAdmin, counts: _counts, headcounts }: Props) {
  const [statusFilter, setStatusFilter] = useState<FilterValue>('OPEN')

  function handleCardClick(value: FilterValue) {
    setStatusFilter((prev) => (prev === value ? '' : value))
  }

  const cards: { label: string; color: string; filterValue: FilterValue; count: number }[] = [
    { label: 'Open', color: 'text-green-600', filterValue: 'OPEN', count: headcounts.OPEN },
    { label: 'On Hold', color: 'text-amber-600', filterValue: 'ON_HOLD', count: headcounts.ON_HOLD },
    { label: 'YTJ', color: 'text-indigo-600', filterValue: 'YTJ', count: headcounts.ytj },
    { label: 'Closed', color: 'text-gray-900', filterValue: 'CLOSED', count: headcounts.CLOSED },
    { label: 'Cancelled', color: 'text-gray-400', filterValue: 'CANCELLED', count: headcounts.CANCELLED },
  ]

  return (
    <>
      <div className="grid grid-cols-5 gap-4">
        {cards.map((c) => (
          <StatusCard
            key={c.filterValue}
            label={c.label}
            count={c.count}
            color={c.color}
            filterValue={c.filterValue}
            active={statusFilter === c.filterValue}
            onClick={handleCardClick}
          />
        ))}
      </div>
      <PositionsTable
        positions={positions}
        isAdmin={isAdmin}
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => setStatusFilter(v as FilterValue)}
      />
    </>
  )
}
