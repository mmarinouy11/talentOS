'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PositionStatus } from '@prisma/client'
import { PositionStatusBadge } from './PositionStatusBadge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

export interface PositionRow {
  id: string
  title: string
  department: string
  status: PositionStatus
  sla_days: number
  createdAt: string
  recruiter: { name: string | null; email: string } | null
  hiringManager: { name: string | null; email: string } | null
  _count: { candidatePositions: number }
}

function aging(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
}

export function PositionsTable({ positions }: { positions: PositionRow[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PositionStatus | ''>('')

  const filtered = positions.filter((p) => {
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.department.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Search by title or department…"
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

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">
            {positions.length === 0 ? 'No positions yet. Create your first one.' : 'No positions match your filters.'}
          </p>
          {positions.length === 0 && (
            <Link href="/positions/new">
              <Button className="mt-4" size="sm">New Position</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Recruiter</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Hiring Manager</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">SLA</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Aging</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Candidates</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p) => {
                const days = aging(p.createdAt)
                const overSla = days > p.sla_days
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                    <td className="px-4 py-3 text-gray-600">{p.department}</td>
                    <td className="px-4 py-3">
                      <PositionStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.recruiter?.name ?? p.recruiter?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {p.hiringManager?.name ?? p.hiringManager?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.sla_days}d</td>
                    <td className={`px-4 py-3 text-right font-medium ${overSla ? 'text-red-600' : 'text-gray-600'}`}>
                      {days}d
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{p._count.candidatePositions}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/positions/${p.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                        <Link href={`/positions/${p.id}/edit`}>
                          <Button variant="outline" size="sm">Edit</Button>
                        </Link>
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
