'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Seniority = 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL'

interface ParsedCandidate {
  fileName: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  country: string | null
  linkedinUrl: string | null
  seniority: Seniority | null
  yearsOfExperience: number | null
  skills: string[]
  languages: string[]
  summary: string | null
  duplicate: boolean
  existingId?: string
  error?: string
}

type Step = 'upload' | 'review' | 'done'

function StatusBadge({ candidate }: { candidate: ParsedCandidate }) {
  if (candidate.error) {
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Parse error</span>
  }
  if (candidate.duplicate) {
    return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Duplicate</span>
  }
  return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">New</span>
}

export default function BulkImportPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<ParsedCandidate[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editedEmails, setEditedEmails] = useState<Record<number, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function processFile(file: File) {
    if (!file.name.endsWith('.zip')) {
      setUploadError('Please upload a .zip file containing LinkedIn profile PDFs.')
      return
    }

    setUploading(true)
    setUploadError(null)

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/candidates/bulk-import', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed.')
        return
      }

      const parsed: ParsedCandidate[] = data.candidates
      setCandidates(parsed)

      // Pre-select all non-error, non-duplicate candidates
      const preselected = new Set<number>(
        parsed
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => !c.error && !c.duplicate)
          .map(({ i }) => i)
      )
      setSelected(preselected)
      setStep('review')
    } catch {
      setUploadError('Failed to process zip file. Please try again.')
    } finally {
      setUploading(false)
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

  async function handleConfirm() {
    setConfirming(true)
    const payload = [...selected].map((i) => {
      const c = candidates[i]
      return {
        ...c,
        email: editedEmails[i] ?? c.email,
      }
    }).filter((c) => c.email)

    try {
      const res = await fetch('/api/candidates/bulk-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUploadError(data.error ?? 'Confirm failed.')
        return
      }
      setResult(data)
      setStep('done')
    } catch {
      setUploadError('Failed to create candidates. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  const eligibleCount = candidates.filter((c) => !c.error).length
  const newCount = candidates.filter((c) => !c.error && !c.duplicate).length
  const dupCount = candidates.filter((c) => c.duplicate).length
  const errCount = candidates.filter((c) => c.error).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Import from LinkedIn</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload a .zip file containing LinkedIn profile PDFs to bulk-create candidates
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/candidates')}>Back to Candidates</Button>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-xl">
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-[#8DF000] bg-[#f9ffe6]' : 'border-gray-200 hover:border-gray-300'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e: React.DragEvent<HTMLDivElement>) => handleDrop(e)}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-gray-700">
              {uploading ? 'Processing…' : 'Drop your .zip file here, or click to browse'}
            </p>
            <p className="text-xs text-gray-400 mt-1">ZIP containing LinkedIn profile PDFs · max 50 files · 50MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {uploading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Extracting and parsing profiles with AI… this may take a minute
            </div>
          )}

          {uploadError && (
            <p className="mt-4 text-sm text-red-600">{uploadError}</p>
          )}

          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-700 text-sm mb-2">How to export from LinkedIn:</p>
            <p>1. On LinkedIn, open a profile → More → Save to PDF</p>
            <p>2. Repeat for each candidate and collect all PDFs into a .zip file</p>
            <p>3. Upload the .zip here — we&apos;ll parse and deduplicate automatically</p>
          </div>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-500">{candidates.length} profiles parsed</span>
            <span className="text-green-600 font-medium">{newCount} new</span>
            {dupCount > 0 && <span className="text-yellow-600">{dupCount} duplicate{dupCount !== 1 ? 's' : ''}</span>}
            {errCount > 0 && <span className="text-red-600">{errCount} error{errCount !== 1 ? 's' : ''}</span>}
            <span className="text-gray-500 ml-auto">{selected.size} selected</span>
          </div>

          {uploadError && (
            <p className="text-sm text-red-600">{uploadError}</p>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-[2px] border-b-[#8DF000] bg-gray-50">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === eligibleCount && eligibleCount > 0}
                      onChange={toggleAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">File</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Seniority</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Skills</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {candidates.map((c, i) => (
                  <tr
                    key={i}
                    className={`${selected.has(i) ? 'bg-[#fafff0]' : ''} ${c.error ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}`}
                    onClick={() => { if (!c.error) toggleRow(i) }}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        disabled={!!c.error}
                        checked={selected.has(i)}
                        onChange={() => toggleRow(i)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate" title={c.fileName}>
                      {c.fileName}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.firstName || c.lastName ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600" onClick={(e) => e.stopPropagation()}>
                      {c.error ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <Input
                          value={editedEmails[i] ?? c.email ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditedEmails((prev) => ({ ...prev, [i]: e.target.value }))}
                          className="h-7 text-xs w-48"
                          placeholder="email@example.com"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.country ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.seniority ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.skills.slice(0, 3).join(', ') || '—'}
                      {c.skills.length > 3 && <span className="text-gray-400"> +{c.skills.length - 3}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge candidate={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleConfirm}
              disabled={selected.size === 0 || confirming}
            >
              {confirming ? 'Creating candidates…' : `Import ${selected.size} candidate${selected.size !== 1 ? 's' : ''}`}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setStep('upload'); setCandidates([]); setSelected(new Set()); setEditedEmails({}) }}
            >
              Start over
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && result && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#8DF000] mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Import complete</h2>
          <div className="space-y-1 text-sm text-gray-600 mb-6">
            <p><span className="font-medium text-green-600">{result.created}</span> candidate{result.created !== 1 ? 's' : ''} created</p>
            {result.skipped > 0 && <p><span className="font-medium text-yellow-600">{result.skipped}</span> skipped (duplicate or missing email)</p>}
            {result.errors.length > 0 && <p><span className="font-medium text-red-600">{result.errors.length}</span> failed</p>}
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push('/candidates')}>View Candidates</Button>
            <Button
              variant="outline"
              onClick={() => { setStep('upload'); setCandidates([]); setSelected(new Set()); setEditedEmails({}); setResult(null) }}
            >
              Import More
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
