'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { PositionStatus, Priority } from '@prisma/client'
import { PositionStatusBadge } from './PositionStatusBadge'
import { PriorityBadge } from './PriorityBadge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type SortDir = 'asc' | 'desc'

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

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  )
}

export interface PositionRow {
  id: string
  title: string
  client: string
  status: PositionStatus
  priority: Priority
  target_date_asap: boolean
  target_date: string | null
  createdAt: string
  dgm: number | null
  dgmAtRisk: boolean
  headcount: number | null
  recruiter: { name: string | null; email: string } | null
  _count: { candidatePositions: number; positionVendors: number }
}

// Flat sort row — derived fields hoisted so useSortableData can compare them
interface SortRow extends PositionRow {
  _recruiterLabel: string
  _agingMs: number
  _candidates: number
  _partners: number
  _targetMs: number
  _priorityOrder: number
  _statusOrder: number
}

const PRIORITY_ORDER: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 }
const STATUS_ORDER: Record<PositionStatus, number> = { OPEN: 0, ON_HOLD: 1, CANCELLED: 2, FILLED: 3, CLOSED: 4 }

function dgmColor(atRisk: boolean): string {
  return atRisk ? 'text-red-600' : 'text-green-600'
}

function fmtTarget(row: PositionRow) {
  if (row.target_date_asap) return 'ASAP'
  if (!row.target_date) return '—'
  return new Date(row.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type SortKey = keyof SortRow

export function PositionsTable({ positions, isAdmin = false }: { positions: PositionRow[]; isAdmin?: boolean }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PositionStatus | ''>('')
  const [rows, setRows] = useState(positions)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey | undefined>(undefined)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const now = Date.now()

  const sortRows: SortRow[] = useMemo(() => rows.map((p) => ({
    ...p,
    _recruiterLabel: p.recruiter?.name ?? p.recruiter?.email ?? '',
    _agingMs: now - new Date(p.createdAt).getTime(),
    _candidates: p._count.candidatePositions,
    _partners: p._count.positionVendors,
    _targetMs: p.target_date_asap ? -1 : p.target_date ? new Date(p.target_date).getTime() : Infinity,
    _priorityOrder: PRIORITY_ORDER[p.priority],
    _statusOrder: STATUS_ORDER[p.status],
  })), [rows, now])

  const filtered = useMemo(() => sortRows.filter((p) => {
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.client.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || p.status === statusFilter
    return matchesSearch && matchesStatus
  }), [sortRows, search, statusFilter])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [filtered, sortKey, sortDir])

  async function handleDelete(p: PositionRow) {
    if (!confirm(`Delete position '${p.title}'? This will hide it from all views. This action can be reversed by an administrator if needed.`)) return
    setDeleting(p.id)
    try {
      const res = await fetch(`/api/positions/${p.id}`, { method: 'DELETE' })
      if (!res.ok) { const body = await res.json().catch(() => ({})); alert(body.error ?? 'Delete failed'); return }
      setRows((prev) => prev.filter((r) => r.id !== p.id))
    } catch { alert('Delete failed — please try again') }
    finally { setDeleting(null) }
  }

  function sh(label: string, key: SortKey, className?: string) {
    return <SortableHeader label={label} active={sortKey === key} direction={sortDir} onClick={() => toggleSort(key)} className={className} />
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input placeholder="Search by title or client…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PositionStatus | '')} className="w-40">
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="FILLED">Filled</option>
          <option value="CLOSED">Closed</option>
        </Select>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">
            {rows.length === 0 ? 'No positions yet. Create your first one.' : 'No positions match your filters.'}
          </p>
          {rows.length === 0 && <Link href="/positions/new"><Button className="mt-4" size="sm">New Position</Button></Link>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[2px] border-b-[#8CF000] bg-gray-50">
                {sh('Title', 'title')}
                {sh('Client', 'client')}
                {sh('Status', '_statusOrder')}
                {sh('Priority', '_priorityOrder')}
                {sh('DGM', 'dgm', 'text-right')}
                {sh('Lead Recruiter', '_recruiterLabel')}
                {sh('Target', '_targetMs')}
                {sh('Aging', '_agingMs', 'text-right')}
                {sh('Candidates', '_candidates', 'text-right')}
                {sh('Partners', '_partners', 'text-right')}
                {sh('HC', 'headcount', 'text-right')}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((p) => {
                const days = Math.floor(p._agingMs / (1000 * 60 * 60 * 24))
                return (
                  <tr key={p.id} className="hover:bg-[#F5F0EB] transition-colors cursor-pointer" onClick={() => { window.location.href = `/positions/${p.id}` }}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.dgmAtRisk && <span className="text-red-600 mr-1" title="Margin at risk">⚠</span>}
                      {p.title}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.client}</td>
                    <td className="px-4 py-3"><PositionStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                    <td className="px-4 py-3 text-right">
                      {p.dgm != null ? <span className={`font-medium ${dgmColor(p.dgmAtRisk)}`}>{(p.dgm * 100).toFixed(0)}%</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.recruiter?.name ?? p.recruiter?.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">{fmtTarget(p)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-600">{days}d</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p._count.candidatePositions}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p._partners > 0 ? p._partners : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.headcount ?? 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(p) }}
                            disabled={deleting === p.id}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Delete position"
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
