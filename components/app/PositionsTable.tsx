'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PositionStatus, Priority } from '@prisma/client'
import { PositionStatusBadge } from './PositionStatusBadge'
import { PriorityBadge } from './PriorityBadge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

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
  recruiter: { name: string | null; email: string } | null
  _count: { candidatePositions: number }
}

function dgmColor(atRisk: boolean): string {
  return atRisk ? 'text-red-600' : 'text-green-600'
}

function aging(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
}

function fmtTarget(row: PositionRow) {
  if (row.target_date_asap) return 'ASAP'
  if (!row.target_date) return '—'
  return new Date(row.target_date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function PositionsTable({ positions, isAdmin = false }: { positions: PositionRow[]; isAdmin?: boolean }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PositionStatus | ''>('')
  const [rows, setRows] = useState(positions)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(p: PositionRow) {
    if (!confirm(`Delete position '${p.title}'? This will hide it from all views. This action can be reversed by an administrator if needed.`)) return
    setDeleting(p.id)
    try {
      const res = await fetch(`/api/positions/${p.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error ?? 'Delete failed')
        return
      }
      setRows((prev) => prev.filter((r) => r.id !== p.id))
    } catch {
      alert('Delete failed — please try again')
    } finally {
      setDeleting(null)
    }
  }

  const filtered = rows.filter((p) => {
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.client.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="Search by title or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PositionStatus | '')}
          className="w-40"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="CLOSED">Closed</option>
          <option value="FILLED">Filled</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">
            {rows.length === 0
              ? 'No positions yet. Create your first one.'
              : 'No positions match your filters.'}
          </p>
          {rows.length === 0 && (
            <Link href="/positions/new">
              <Button className="mt-4" size="sm">New Position</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">DGM</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Recruiter</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Target</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Aging</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Candidates</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p) => {
                const days = aging(p.createdAt)
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-[#F5F0EB] transition-colors cursor-pointer"
                    onClick={() => { window.location.href = `/positions/${p.id}` }}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.dgmAtRisk && <span className="text-red-600 mr-1" title="Margin at risk">⚠</span>}
                      {p.title}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.client}</td>
                    <td className="px-4 py-3">
                      <PositionStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={p.priority} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.dgm != null ? (
                        <span className={`font-medium ${dgmColor(p.dgmAtRisk)}`}>
                          {(p.dgm * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.recruiter?.name ?? p.recruiter?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {fmtTarget(p)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-600">
                      {days}d
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {p._count.candidatePositions}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/positions/${p.id}/edit`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="outline" size="sm">Edit</Button>
                        </Link>
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
