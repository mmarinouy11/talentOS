'use client'

import { useEffect, useMemo, useState } from 'react'
import { PositionsTable } from '@/components/app/PositionsTable'
import type { PositionRow, TypeFilter } from '@/components/app/PositionsTable'

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
}

const CLIENT_STORAGE_KEY = 'positions-client-filter'

function readSavedClient(): string {
  try { return sessionStorage.getItem(CLIENT_STORAGE_KEY) ?? '' } catch { return '' }
}

export function PositionsDashboard({ positions, isAdmin }: Props) {
  const [statusFilter, setStatusFilter] = useState<FilterValue>('OPEN')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('REQUISITION')
  const [clientFilter, setClientFilter] = useState<string>(readSavedClient)

  useEffect(() => {
    try { sessionStorage.setItem(CLIENT_STORAGE_KEY, clientFilter) } catch { /* sessionStorage unavailable */ }
  }, [clientFilter])

  const clients = useMemo(
    () => [...new Set(positions.map((p) => p.client))].sort((a, b) => a.localeCompare(b)),
    [positions],
  )
  // A saved client that no longer has positions falls back to "All clients"
  const activeClient = clients.includes(clientFilter) ? clientFilter : ''

  // Cards reflect the selected client; proactive positions stay out of the status cards
  const { headcounts, proactiveOpenCount } = useMemo(() => {
    const hc = { OPEN: 0, ON_HOLD: 0, FILLED: 0, CLOSED: 0, CANCELLED: 0, ytj: 0 }
    let proactive = 0
    for (const p of positions) {
      if (activeClient && p.client !== activeClient) continue
      if (p.type === 'PROACTIVE') {
        if (p.status === 'OPEN') proactive++
        continue
      }
      hc[p.status] += p.headcount ?? 1
      if (p.isYtj) hc.ytj += p.headcount ?? 1
    }
    return { headcounts: hc, proactiveOpenCount: proactive }
  }, [positions, activeClient])

  // Status cards count requisitions only, so clicking one switches the list back to requisitions
  function handleCardClick(value: FilterValue) {
    if (typeFilter !== 'REQUISITION') {
      setTypeFilter('REQUISITION')
      setStatusFilter(value)
      return
    }
    setStatusFilter((prev) => (prev === value ? '' : value))
  }

  function handleProactiveClick() {
    if (typeFilter === 'PROACTIVE') {
      setTypeFilter('REQUISITION')
      setStatusFilter('OPEN')
    } else {
      setTypeFilter('PROACTIVE')
      setStatusFilter('OPEN')
    }
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
      <div className="flex items-stretch gap-4">
        <div className="grid grid-cols-5 gap-4 flex-1">
          {cards.map((c) => (
            <StatusCard
              key={c.filterValue}
              label={c.label}
              count={c.count}
              color={c.color}
              filterValue={c.filterValue}
              active={typeFilter === 'REQUISITION' && statusFilter === c.filterValue}
              onClick={handleCardClick}
            />
          ))}
        </div>
        <div className="w-px bg-gray-200 shrink-0" aria-hidden />
        <button
          type="button"
          onClick={handleProactiveClick}
          title="Open proactive positions (pipeline built ahead of a requisition)"
          className={`text-left w-44 shrink-0 rounded-xl px-5 py-4 transition-all cursor-pointer focus:outline-none bg-gray-50 ${
            typeFilter === 'PROACTIVE'
              ? 'border-2 border-gray-500 shadow-sm'
              : 'border border-dashed border-gray-300 hover:border-gray-400'
          }`}
        >
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Proactive</p>
          <p className="text-3xl font-semibold mt-1 text-gray-600">{proactiveOpenCount}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">open positions</p>
        </button>
      </div>
      <PositionsTable
        positions={positions}
        isAdmin={isAdmin}
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => setStatusFilter(v as FilterValue)}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        clientFilter={activeClient}
        onClientFilterChange={setClientFilter}
        clients={clients}
      />
    </>
  )
}
