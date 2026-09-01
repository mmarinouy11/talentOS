'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Seniority, SourceType } from '@prisma/client'
import { SeniorityBadge } from './SeniorityBadge'
import { SkillTags } from './SkillTags'
import { Input } from '@/components/ui/input'
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

export interface CandidateRow {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  country: string | null
  seniority: Seniority | null
  skills: string[]
  createdAt: string
  _count: { candidatePositions: number }
  sourcedByType: SourceType | null
  sourcedByOther: string | null
  sourcedByUser: { name: string | null; email: string } | null
  sourcedByVendor: { id: string; name: string } | null
  candidateStatus?: 'active' | 'hired' | 'rejected'
}

interface SortRow extends CandidateRow {
  _name: string
  _sourceLabel: string
  _seniorityOrder: number
  _openPositions: number
  _createdAt: number
}

const SENIORITY_ORDER: Record<Seniority, number> = { JUNIOR: 0, MID: 1, SENIOR: 2, STAFF: 3, PRINCIPAL: 4 }

function sourceLabel(row: CandidateRow): string {
  if (!row.sourcedByType) return ''
  if (row.sourcedByType === 'RECRUITER') return row.sourcedByUser?.name ?? row.sourcedByUser?.email ?? ''
  if (row.sourcedByType === 'VENDOR') return row.sourcedByVendor?.name ?? ''
  if (row.sourcedByType === 'DIRECT') return 'Direct Application'
  return row.sourcedByOther ?? ''
}

type SortKey = keyof SortRow

function SourceCell({ row }: { row: CandidateRow }) {
  if (!row.sourcedByType) return <span className="text-gray-400">—</span>
  if (row.sourcedByType === 'RECRUITER') return (
    <span className="text-gray-700 text-xs">
      {row.sourcedByUser?.name ?? row.sourcedByUser?.email ?? '—'}{' '}
      <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">Int.</span>
    </span>
  )
  if (row.sourcedByType === 'VENDOR') return (
    <span className="text-gray-700 text-xs">
      {row.sourcedByVendor?.name ?? '—'}{' '}
      <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">Partner</span>
    </span>
  )
  if (row.sourcedByType === 'DIRECT') return (
    <span className="text-gray-700 text-xs">
      Direct Application{' '}
      <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">Direct</span>
    </span>
  )
  if (row.sourcedByType === 'REFERRAL') return (
    <span className="text-gray-700 text-xs">
      {row.sourcedByVendor?.name ?? '—'}{' '}
      <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">Referral</span>
    </span>
  )
  return (
    <span className="text-gray-700 text-xs">
      {row.sourcedByOther ?? '—'}{' '}
      <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">Other</span>
    </span>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  )
}

export function CandidatesTable({
  candidates,
  statusFilter: controlledStatus,
  onStatusFilterChange,
}: {
  candidates: CandidateRow[]
  statusFilter?: 'active' | 'hired' | 'rejected' | ''
  onStatusFilterChange?: (v: 'active' | 'hired' | 'rejected' | '') => void
}) {
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [rows, setRows] = useState(candidates)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('_createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleDelete(c: CandidateRow) {
    if (!confirm(`Permanently delete ${c.firstName} ${c.lastName}? This will remove them from all positions and cannot be undone.`)) return
    setDeleting(c.id)
    try {
      const res = await fetch(`/api/candidates/${c.id}`, { method: 'DELETE' })
      if (!res.ok) { const body = await res.json().catch(() => ({})); alert(body.error ?? 'Delete failed'); return }
      setRows((prev) => prev.filter((r) => r.id !== c.id))
    } catch { alert('Delete failed — please try again') }
    finally { setDeleting(null) }
  }

  const uniqueCountries = useMemo(() => {
    const set = new Set<string>()
    for (const c of rows) { if (c.country) set.add(c.country) }
    return [...set].sort()
  }, [rows])

  const filtersActive = !!(filterCountry || filterSource)

  function clearFilters() { setFilterCountry(''); setFilterSource('') }

  const sortRows: SortRow[] = useMemo(() => rows.map((c) => ({
    ...c,
    _name: `${c.firstName} ${c.lastName}`,
    _sourceLabel: sourceLabel(c),
    _seniorityOrder: c.seniority != null ? SENIORITY_ORDER[c.seniority] : -1,
    _openPositions: c._count.candidatePositions,
    _createdAt: new Date(c.createdAt).getTime(),
  })), [rows])

  const statusFilter_ = controlledStatus !== undefined ? controlledStatus : ''

  // Filter first, then sort
  const filtered = useMemo(() => sortRows.filter((c) => {
    if (search) {
      const q = search.toLowerCase()
      const matchesSearch = (
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.skills.some((s) => s.toLowerCase().includes(q))
      )
      if (!matchesSearch) return false
    }
    if (filterCountry && c.country !== filterCountry) return false
    if (filterSource && c.sourcedByType !== filterSource) return false
    if (statusFilter_ && c.candidateStatus !== statusFilter_) return false
    return true
  }), [sortRows, search, filterCountry, filterSource, statusFilter_])

  const sorted = useMemo(() => {
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

  function sh(label: string, key: SortKey, className?: string) {
    return <SortableHeader label={label} active={sortKey === key} direction={sortDir} onClick={() => toggleSort(key)} className={className} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search by name, email, or skill…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

        {uniqueCountries.length > 1 && (
          <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="h-9 py-1.5 pl-2 pr-7 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#8CF000] bg-white">
            <option value="">All Countries</option>
            {uniqueCountries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="h-9 py-1.5 pl-2 pr-7 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#8CF000] bg-white">
          <option value="">All Sources</option>
          <option value="RECRUITER">Internal Recruiter</option>
          <option value="VENDOR">Partner</option>
          <option value="DIRECT">Direct Application</option>
          <option value="OTHER">Other</option>
        </select>

        {(filtersActive || search) && (
          <button onClick={() => { clearFilters(); setSearch('') }} className="text-xs text-gray-500 hover:text-gray-800 underline whitespace-nowrap">
            Clear filters
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">
            {rows.length === 0 ? 'No candidates yet.' : 'No candidates match your search.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[2px] border-b-[#8CF000] bg-gray-50">
                {sh('Name', '_name')}
                {sh('Date Added', '_createdAt')}
                {sh('Email', 'email')}
                {sh('Country', 'country')}
                {sh('Seniority', '_seniorityOrder')}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Skills</th>
                {sh('Source', '_sourceLabel')}
                {sh('Open Positions', '_openPositions', 'text-right')}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((c) => (
                <tr key={c.id} className="hover:bg-[#F5F0EB] transition-colors cursor-pointer" onClick={() => { window.location.href = `/candidates/${c.id}` }}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/candidates/${c.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email}</td>
                  <td className="px-4 py-3 text-gray-600">{c.country ?? '—'}</td>
                  <td className="px-4 py-3">{c.seniority ? <SeniorityBadge seniority={c.seniority} /> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3"><SkillTags tags={c.skills} max={3} /></td>
                  <td className="px-4 py-3"><SourceCell row={c} /></td>
                  <td className="px-4 py-3 text-right text-gray-600">{c._count.candidatePositions}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c) }} disabled={deleting === c.id} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40" title="Delete candidate">
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
