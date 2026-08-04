'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ParsedCandidate } from '@/lib/import-jobs'
import { isPlaceholderEmail } from '@/lib/import-jobs'
import type { ConfirmResult } from '@/app/api/candidates/bulk-import/confirm/route'

export type { ParsedCandidate }

export interface NewCandidatePosition {
  id: string
  stage: 'APPLIED'
  status: 'ACTIVE'
  fitScore: null
  createdAt: string
  compensationOutOfRange?: boolean
  candidate: {
    id: string
    firstName: string
    lastName: string
    email: string
    country: string | null
    seniority: string | null
  }
}

interface Props {
  positionId?: string
  onDone: (result: ConfirmResult, candidatePositions?: NewCandidatePosition[]) => void
  onCancel: () => void
  compact?: boolean
}

type FlowStep = 'upload' | 'parsing' | 'review' | 'confirming' | 'done'

function StatusBadge({ candidate }: { candidate: ParsedCandidate }) {
  if (candidate.error) {
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Parse error</span>
  }
  if (candidate.duplicate) {
    return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Duplicate</span>
  }
  return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">New</span>
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div className="space-y-2">
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#8DF000] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 text-center">
        Parsing profiles… {completed} of {total} complete
      </p>
    </div>
  )
}

export function LinkedInImportFlow({ positionId, onDone, onCancel, compact = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<FlowStep>('upload')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // parsing state
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobTotal, setJobTotal] = useState(0)
  const [jobCompleted, setJobCompleted] = useState(0)

  // review state
  const [candidates, setCandidates] = useState<ParsedCandidate[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editedEmails, setEditedEmails] = useState<Record<number, string>>({})

  // done state
  const [result, setResult] = useState<ConfirmResult | null>(null)

  // Poll for job progress
  useEffect(() => {
    if (step !== 'parsing' || !jobId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/candidates/bulk-import/status/${jobId}`)
        if (!res.ok) {
          clearInterval(interval)
          setError('Failed to check parsing status.')
          setStep('upload')
          return
        }
        const data = await res.json()

        if (data.error) {
          clearInterval(interval)
          setError(data.error)
          setStep('upload')
          return
        }

        setJobCompleted(data.completed)

        if (data.done) {
          clearInterval(interval)
          const parsed: ParsedCandidate[] = data.results
          setCandidates(parsed)
          const preselected = new Set<number>(
            parsed
              .map((c, i) => ({ c, i }))
              .filter(({ c }) => !c.error && !c.duplicate)
              .map(({ i }) => i)
          )
          setSelected(preselected)
          setStep('review')
        }
      } catch {
        clearInterval(interval)
        setError('Connection error while checking parsing status.')
        setStep('upload')
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [step, jobId])

  async function processFile(file: File) {
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a .zip file containing LinkedIn profile PDFs.')
      return
    }

    setError(null)
    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch('/api/candidates/bulk-import', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Upload failed.')
        return
      }

      setJobId(data.jobId)
      setJobTotal(data.total)
      setJobCompleted(0)
      setStep('parsing')
    } catch {
      setError('Failed to upload file. Please try again.')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  function toggleAll() {
    const eligible = candidates.map((c, i) => ({ c, i })).filter(({ c }) => !c.error)
    if (selected.size === eligible.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(eligible.map(({ i }) => i)))
    }
  }

  function toggleRow(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function reset() {
    setStep('upload')
    setCandidates([])
    setSelected(new Set())
    setEditedEmails({})
    setJobId(null)
    setJobTotal(0)
    setJobCompleted(0)
    setError(null)
    setResult(null)
  }

  async function handleConfirm() {
    setStep('confirming')
    const payload = [...selected].map((i) => {
      const c = candidates[i]
      return { ...c, email: editedEmails[i] ?? c.email }
    })

    try {
      const res = await fetch('/api/candidates/bulk-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: payload, positionId }),
      })
      const data: ConfirmResult = await res.json()
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Confirm failed.')
        setStep('review')
        return
      }
      setResult(data)
      if (compact) {
        // In modal mode, notify parent immediately instead of showing done screen
        onDone(data, data.candidatePositions as NewCandidatePosition[])
        return
      }
      setStep('done')
    } catch {
      setError('Failed to create candidates. Please try again.')
      setStep('review')
    }
  }

  const eligibleCount = candidates.filter((c) => !c.error).length
  const newCount = candidates.filter((c) => !c.error && !c.duplicate).length
  const dupCount = candidates.filter((c) => c.duplicate).length
  const errCount = candidates.filter((c) => c.error).length
  const selectedPlaceholderCount = [...selected].filter((i) => isPlaceholderEmail(editedEmails[i] ?? candidates[i]?.email)).length

  // --- Upload zone (shared by upload + parsing steps) ---
  const uploadZone = (
    <div className={compact ? '' : 'max-w-xl'}>
      <div
        className={`border-2 border-dashed rounded-lg text-center transition-colors cursor-pointer ${
          compact ? 'p-8' : 'p-12'
        } ${dragOver ? 'border-[#8DF000] bg-[#f9ffe6]' : 'border-gray-200 hover:border-gray-300'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: React.DragEvent<HTMLDivElement>) => handleDrop(e)}
        onClick={() => step === 'upload' && fileInputRef.current?.click()}
      >
        {step === 'parsing' ? (
          <div className="space-y-4">
            <svg className="mx-auto animate-spin h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <ProgressBar completed={jobCompleted} total={jobTotal} />
          </div>
        ) : (
          <>
            <svg className="mx-auto h-10 w-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-gray-700">Drop your .zip file here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">ZIP containing LinkedIn profile PDFs · max 50 files · 50MB</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileChange}
          disabled={step === 'parsing'}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!compact && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-700 text-sm mb-2">How to export from LinkedIn:</p>
          <p>1. On LinkedIn, open a profile → More → Save to PDF</p>
          <p>2. Repeat for each candidate and collect all PDFs into a .zip file</p>
          <p>3. Upload the .zip here — we&apos;ll parse and deduplicate automatically</p>
        </div>
      )}
    </div>
  )

  if (step === 'upload' || step === 'parsing') {
    return uploadZone
  }

  if (step === 'review' || step === 'confirming') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">{candidates.length} profiles parsed</span>
          <span className="text-green-600 font-medium">{newCount} new</span>
          {dupCount > 0 && <span className="text-yellow-600">{dupCount} duplicate{dupCount !== 1 ? 's' : ''}</span>}
          {errCount > 0 && <span className="text-red-600">{errCount} error{errCount !== 1 ? 's' : ''}</span>}
          <span className="text-gray-500 ml-auto">{selected.size} selected</span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className={`bg-white rounded-xl border border-gray-200 overflow-x-auto ${compact ? 'max-h-64 overflow-y-auto' : ''}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size === eligibleCount && eligibleCount > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Email</th>
                {!compact && <th className="text-left px-3 py-2 font-medium text-gray-600">Country</th>}
                <th className="text-left px-3 py-2 font-medium text-gray-600">Seniority</th>
                {!compact && (
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Skills</th>
                )}
                <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {candidates.map((c, i) => (
                <tr
                  key={i}
                  className={`${selected.has(i) ? 'bg-[#fafff0]' : ''} ${c.error ? 'opacity-50' : 'cursor-pointer hover:bg-[#F5F0EB]'}`}
                  onClick={() => { if (!c.error) toggleRow(i) }}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      disabled={!!c.error}
                      checked={selected.has(i)}
                      onChange={() => toggleRow(i)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {c.firstName || c.lastName
                      ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600" onClick={(e) => e.stopPropagation()}>
                    {c.error ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editedEmails[i] ?? c.email ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setEditedEmails((prev) => ({ ...prev, [i]: e.target.value }))
                          }
                          className="h-6 text-xs w-40"
                          placeholder="email@example.com"
                        />
                        {isPlaceholderEmail(editedEmails[i] ?? c.email) && (
                          <span
                            className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 cursor-help shrink-0"
                            title="Placeholder email — update with real email before sending any communications"
                          >
                            !
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  {!compact && <td className="px-3 py-2 text-gray-600">{c.country ?? '—'}</td>}
                  <td className="px-3 py-2 text-gray-600 text-xs">{c.seniority ?? '—'}</td>
                  {!compact && (
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {c.skills.slice(0, 3).join(', ') || '—'}
                      {c.skills.length > 3 && <span className="text-gray-400"> +{c.skills.length - 3}</span>}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <StatusBadge candidate={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedPlaceholderCount > 0 && (
          <p className="text-xs text-amber-600">
            {selectedPlaceholderCount} selected candidate{selectedPlaceholderCount !== 1 ? 's have' : ' has'} a placeholder email (!) — update with a real email before sending any communications.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0 || step === 'confirming'}
            size={compact ? 'sm' : 'default'}
          >
            {step === 'confirming'
              ? 'Creating…'
              : positionId
                ? `Add ${selected.size} to position`
                : `Import ${selected.size} candidate${selected.size !== 1 ? 's' : ''}`}
          </Button>
          <Button variant="outline" size={compact ? 'sm' : 'default'} onClick={reset}>
            Start over
          </Button>
          {compact && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    )
  }

  // done (standalone only — compact calls onDone directly)
  if (step === 'done' && result) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#8DF000] mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Import complete</h2>
        <div className="space-y-1 text-sm text-gray-600 mb-6">
          <p><span className="font-medium text-green-600">{result.created}</span> candidate{result.created !== 1 ? 's' : ''} created</p>
          {result.skipped > 0 && <p><span className="font-medium text-yellow-600">{result.skipped}</span> skipped</p>}
          {result.errors.length > 0 && <p><span className="font-medium text-red-600">{result.errors.length}</span> failed</p>}
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => onDone(result)}>Done</Button>
          <Button variant="outline" onClick={reset}>Import More</Button>
        </div>
      </div>
    )
  }

  return null
}
