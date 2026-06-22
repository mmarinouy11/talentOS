'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Seniority, SourceType } from '@prisma/client'
import { SeniorityBadge } from './SeniorityBadge'
import { SkillTags } from './SkillTags'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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

function SourceCell({ row }: { row: CandidateRow }) {
  if (!row.sourcedByType) return <span className="text-gray-400">—</span>

  if (row.sourcedByType === 'RECRUITER') {
    return (
      <span className="text-gray-700 text-xs">
        {row.sourcedByUser?.name ?? row.sourcedByUser?.email ?? '—'}
        {' '}
        <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">Int.</span>
      </span>
    )
  }
  if (row.sourcedByType === 'VENDOR') {
    return (
      <span className="text-gray-700 text-xs">
        {row.sourcedByVendor?.name ?? '—'}
        {' '}
        <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">Vendor</span>
      </span>
    )
  }
  return (
    <span className="text-gray-700 text-xs">
      {row.sourcedByOther ?? '—'}
      {' '}
      <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-500">Other</span>
    </span>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
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
              <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Seniority</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Skills</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Open Positions</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => { window.location.href = `/candidates/${c.id}` }}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/candidates/${c.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <span>{c.phone ?? '—'}</span>
                      {c.phone && (
                        <a
                          href={`https://wa.me/${c.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-green-600 hover:text-green-700"
                          title="Open WhatsApp"
                        >
                          <WhatsAppIcon />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.country ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.seniority ? <SeniorityBadge seniority={c.seniority} /> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <SkillTags tags={c.skills} max={3} />
                  </td>
                  <td className="px-4 py-3">
                    <SourceCell row={c} />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {c._count.candidatePositions}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/candidates/${c.id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                      >
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
