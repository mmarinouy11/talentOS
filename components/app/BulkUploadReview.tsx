'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { MatchBadge } from './BulkUploadBadges'

type Person = { id: string; name: string; email: string | null; deleted: boolean }

export interface ReviewRow {
  id: string
  fileName: string
  driveFileId: string | null
  status: string
  matchType: string | null
  error: string | null
  parsedName: string | null
  parsedEmail: string | null
  candidate: Person | null
  duplicateOf: Person | null
  alreadyInPosition: boolean
  fitScore: number | null
  inPipeline: boolean
  selectable: boolean
  preselected: boolean
}

interface Props {
  bulkUploadId: string
  status: string
  hasPosition: boolean
  threshold: number
  rows: ReviewRow[]
  canAct: boolean
}

export function BulkUploadReview({ bulkUploadId, status, hasPosition, threshold, rows, canAct }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.filter((r) => r.preselected).map((r) => r.id)))
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [busy, setBusy] = useState<'confirm' | 'retry' | 'cancel' | null>(null)
  const [error, setError] = useState('')
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [contacts, setContacts] = useState<Record<string, string>>({})

  // Keep progress live while processing
  useEffect(() => {
    if (status !== 'PROCESSING') return
    const t = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(t)
  }, [status, router])

  // Rows that become selectable after a refresh (e.g. a decision) get their default selection
  const [seen, setSeen] = useState<Set<string>>(() => new Set(rows.filter((r) => r.selectable).map((r) => r.id)))
  const newlySelectable = rows.filter((r) => r.selectable && !seen.has(r.id))
  if (newlySelectable.length > 0) {
    setSeen(new Set([...seen, ...newlySelectable.map((r) => r.id)]))
    setSelected(new Set([...selected, ...newlySelectable.filter((r) => r.preselected).map((r) => r.id)]))
  }

  const selectable = rows.filter((r) => r.selectable)
  const selectedIds = selectable.filter((r) => selected.has(r.id)).map((r) => r.id)
  const failed = rows.filter((r) => r.status === 'FAILED').length

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
    return data
  }

  async function decide(rowId: string, decision: 'same' | 'different') {
    setBusyRow(rowId); setRowErrors((e) => ({ ...e, [rowId]: '' }))
    try {
      await post(`/api/bulk-uploads/${bulkUploadId}/items/${rowId}/decide`, { decision })
      router.refresh()
    } catch (err) {
      setRowErrors((e) => ({ ...e, [rowId]: (err as Error).message }))
    } finally {
      setBusyRow(null)
    }
  }

  // Missing contact: one input taking an email or a LinkedIn profile URL
  async function saveContact(rowId: string) {
    const value = (contacts[rowId] ?? '').trim()
    const isEmail = value.includes('@')
    if (!value) { setRowErrors((e) => ({ ...e, [rowId]: 'Enter an email or a LinkedIn profile URL' })); return }
    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setRowErrors((e) => ({ ...e, [rowId]: 'Enter a valid email address' })); return }
    if (!isEmail && !/linkedin\.com\/in\/|^\/?in\//i.test(value)) { setRowErrors((e) => ({ ...e, [rowId]: 'Enter a valid LinkedIn profile URL (linkedin.com/in/…)' })); return }
    setBusyRow(rowId); setRowErrors((e) => ({ ...e, [rowId]: '' }))
    try {
      await post(`/api/bulk-uploads/${bulkUploadId}/items/${rowId}/contact`, isEmail ? { email: value } : { linkedinUrl: value })
      router.refresh()
    } catch (err) {
      setRowErrors((e) => ({ ...e, [rowId]: (err as Error).message }))
    } finally {
      setBusyRow(null)
    }
  }

  async function action(kind: 'confirm' | 'retry' | 'cancel') {
    if (kind === 'cancel' && !confirm('Cancel this batch? Candidates already created stay in the talent pool.')) return
    setBusy(kind); setError('')
    try {
      if (kind === 'confirm') await post(`/api/bulk-uploads/${bulkUploadId}/confirm`, { itemIds: selectedIds })
      if (kind === 'retry') await post(`/api/bulk-uploads/${bulkUploadId}/retry-failed`)
      if (kind === 'cancel') await post(`/api/bulk-uploads/${bulkUploadId}/cancel`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const cols = hasPosition ? 7 : 5

  return (
    <div className="space-y-4">
      {canAct && (
        <div className="flex flex-wrap items-center gap-2">
          {hasPosition && (
            <Button onClick={() => action('confirm')} disabled={busy !== null || status !== 'READY' || selectedIds.length === 0}>
              {busy === 'confirm' ? 'Adding…' : `Add ${selectedIds.length} selected to pipeline`}
            </Button>
          )}
          {failed > 0 && (
            <Button variant="outline" onClick={() => action('retry')} disabled={busy !== null}>
              {busy === 'retry' ? 'Retrying…' : `Retry failed (${failed})`}
            </Button>
          )}
          <Button variant="outline" onClick={() => action('cancel')} disabled={busy !== null}>
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel batch'}
          </Button>
          {hasPosition && status === 'PROCESSING' && <span className="text-xs text-gray-500">You can add candidates once every CV is processed.</span>}
          {hasPosition && status === 'READY' && <span className="text-xs text-gray-500">Preselected: fit score ≥ {threshold}. Unselected candidates stay in the talent pool.</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-[2px] border-b-[#8CF000] bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              {hasPosition && <th className="px-3 py-2 w-8" />}
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              {hasPosition && <th className="px-3 py-2 text-right">Fit</th>}
              <th className="px-3 py-2">Match</th>
              <th className="px-3 py-2">File</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && <tr><td colSpan={cols} className="px-3 py-8 text-center text-gray-400">No files in this batch</td></tr>}
            {rows.map((r) => {
              const name = r.candidate?.name ?? r.parsedName ?? '—'
              const email = r.candidate?.email ?? r.parsedEmail
              return (
                <tr key={r.id} className="hover:bg-[#F5F0EB] transition-colors align-top">
                  {hasPosition && (
                    <td className="px-3 py-2.5">
                      {r.selectable && canAct && (
                        <input type="checkbox" className="accent-[#2F2C29]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${name}`} />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    {r.candidate && !r.candidate.deleted
                      ? <Link href={`/candidates/${r.candidate.id}`} className="font-medium text-gray-900 hover:underline">{name}</Link>
                      : <span className="text-gray-900">{name}</span>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.alreadyInPosition && <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Already in this position</span>}
                      {r.inPipeline && <span className="inline-flex rounded-full bg-[#F5F0EB] px-2 py-0.5 text-xs text-[#2F2C29]">Added to pipeline</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{email ?? <span className="text-gray-400">—</span>}</td>
                  {hasPosition && <td className="px-3 py-2.5 text-right font-medium text-[#2F2C29]">{r.fitScore ?? <span className="text-gray-400 font-normal">—</span>}</td>}
                  <td className="px-3 py-2.5"><MatchBadge matchType={r.matchType} status={r.status} /></td>
                  <td className="px-3 py-2.5 max-w-[200px]">
                    {r.driveFileId
                      ? <a href={`https://drive.google.com/file/d/${r.driveFileId}/view`} target="_blank" rel="noopener noreferrer" className="block truncate text-gray-600 underline underline-offset-2 hover:text-gray-900" title={r.fileName}>{r.fileName}</a>
                      : <span className="block truncate text-gray-500" title={r.fileName}>{r.fileName}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.status === 'NEEDS_DECISION' && !r.matchType && canAct && (
                      busyRow === r.id
                        ? <span className="inline-flex items-center gap-1.5 text-gray-500"><span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-[#2F2C29]" />Working…</span>
                        : <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); saveContact(r.id) }}>
                            <input
                              value={contacts[r.id] ?? ''}
                              onChange={(e) => setContacts((c) => ({ ...c, [r.id]: e.target.value }))}
                              placeholder="Email or LinkedIn URL"
                              className="w-48 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-[#2F2C29] focus:outline-none"
                              aria-label={`Email or LinkedIn for ${name}`}
                            />
                            <Button size="sm" type="submit" disabled={busyRow !== null}>Save</Button>
                          </form>
                    )}
                    {r.status === 'NEEDS_DECISION' && r.duplicateOf && (
                      <div className="space-y-1.5">
                        <p className="text-gray-700">
                          Possibly{' '}
                          <Link href={`/candidates/${r.duplicateOf.id}`} className="font-medium underline underline-offset-2" target="_blank">{r.duplicateOf.name}</Link>
                          {r.duplicateOf.email && <span className="text-gray-500"> · {r.duplicateOf.email}</span>}
                        </p>
                        {canAct && (
                          busyRow === r.id
                            ? <span className="inline-flex items-center gap-1.5 text-gray-500"><span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-[#2F2C29]" />Working…</span>
                            : <div className="flex gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => decide(r.id, 'same')} disabled={busyRow !== null}>Same person</Button>
                                <Button size="sm" variant="outline" onClick={() => decide(r.id, 'different')} disabled={busyRow !== null}>Different person</Button>
                              </div>
                        )}
                      </div>
                    )}
                    {(rowErrors[r.id] || r.error) && <p className={`${r.status === 'FAILED' || rowErrors[r.id] ? 'text-red-600' : 'text-gray-500'} mt-1`}>{rowErrors[r.id] || r.error}</p>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
