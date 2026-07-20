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
  _count: { candidatePositions: number }
  sourcedByType: SourceType | null
  sourcedByOther: string | null
  sourcedByUser: { name: string | null; email: string } | null
  sourcedByVendor: { id: string; name: string } | null
}

interface SortRow extends CandidateRow {
  _name: string
  _sourceLabel: string
  _seniorityOrder: number
  _openPositions: number
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
  return (
    <span className="text-gray-700 text-xs">
      {row.sourcedByOther ?? '—'}{' '}
      <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">Other</span>
    </span>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  )
}

export function CandidatesTable({ candidates }: { candidates: CandidateRow[] }) {
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [rows, setRows] = useState(candidates)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey | undefined>(undefined)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

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
  })), [rows])

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
    return true
  }), [sortRows, search, filterCountry, filterSource])

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

  function sh(label: string, key: SortKey, className?: string) {
    return <SortableHeader label={label} active={sortKey === key} direction={sortDir} onClick={() => toggleSort(key)} className={className} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search by name, email, or skill…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

        {uniqueCountries.length > 1 && (
          <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="h-9 py-1.5 pl-2 pr-7 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#8DF000] bg-white">
            <option value="">All Countries</option>
            {uniqueCountries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="h-9 py-1.5 pl-2 pr-7 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#8DF000] bg-white">
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
              <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
                {sh('Name', '_name')}
                {sh('Email', 'email')}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
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
                <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => { window.location.href = `/candidates/${c.id}` }}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/candidates/${c.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <span>{c.phone ?? '—'}</span>
                      {c.phone && (
                        <a href={`https://wa.me/${c.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-green-600 hover:text-green-700" title="Open WhatsApp">
                          <WhatsAppIcon />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.country ?? '—'}</td>
                  <td className="px-4 py-3">{c.seniority ? <SeniorityBadge seniority={c.seniority} /> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3"><SkillTags tags={c.skills} max={3} /></td>
                  <td className="px-4 py-3"><SourceCell row={c} /></td>
                  <td className="px-4 py-3 text-right text-gray-600">{c._count.candidatePositions}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Link href={`/candidates/${c.id}/edit`} onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm">Edit</Button>
                      </Link>
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
