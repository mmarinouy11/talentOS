'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Seniority } from '@prisma/client'
import { SeniorityBadge } from './SeniorityBadge'
import { SkillTags } from './SkillTags'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export interface CandidateRow {
  id: string
  firstName: string
  lastName: string
  email: string
  country: string | null
  seniority: Seniority | null
  skills: string[]
  _count: { candidatePositions: number }
}

export function CandidatesTable({ candidates }: { candidates: CandidateRow[] }) {
  const [search, setSearch] = useState('')

  const filtered = candidates.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">
            {candidates.length === 0 ? 'No candidates yet.' : 'No candidates match your search.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Seniority</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Skills</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Open Positions</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email}</td>
                  <td className="px-4 py-3 text-gray-600">{c.country ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.seniority ? <SeniorityBadge seniority={c.seniority} /> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <SkillTags tags={c.skills} max={3} />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {c._count.candidatePositions}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Link href={`/candidates/${c.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                      <Link href={`/candidates/${c.id}/edit`}>
                        <Button variant="ghost" size="sm">Edit</Button>
                      </Link>
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
