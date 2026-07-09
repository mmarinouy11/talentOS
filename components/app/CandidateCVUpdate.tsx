'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Seniority } from '@prisma/client'

interface ParsedFields {
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  country?: string | null
  seniority?: Seniority | null
  yearsOfExperience?: number | null
  skills?: string[]
  languages?: string[]
  summary?: string | null
  strengths?: string[]
  risks?: string[]
  currentCompensation?: number | null
  cvOriginalName?: string | null
  cvDriveId?: string | null
}

interface CandidateCVUpdateProps {
  candidateId: string
  currentCvOriginalName: string | null
  currentCvDriveId: string | null
  onReparsed: (fields: ParsedFields) => void
}

export function CandidateCVUpdate({
  candidateId,
  currentCvOriginalName,
  currentCvDriveId,
  onReparsed,
}: CandidateCVUpdateProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError('')
    setSuccess(false)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/candidates/${candidateId}/reparse-cv`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Upload failed')
        return
      }
      const { candidate, parsed } = data
      onReparsed({
        firstName: parsed.firstName ?? null,
        lastName: parsed.lastName ?? null,
        phone: parsed.phone ?? null,
        country: parsed.country ?? null,
        seniority: parsed.seniority ?? null,
        yearsOfExperience: parsed.yearsOfExperience ?? null,
        skills: parsed.skills ?? [],
        languages: parsed.languages ?? [],
        summary: parsed.summary ?? null,
        strengths: parsed.strengths ?? [],
        risks: parsed.risks ?? [],
        currentCompensation: parsed.currentCompensation ?? null,
        cvOriginalName: candidate.cvOriginalName ?? null,
        cvDriveId: candidate.cvDriveId ?? null,
      })
      setSuccess(true)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  const viewUrl = currentCvDriveId
    ? `https://drive.google.com/file/d/${currentCvDriveId}/view`
    : null

  return (
    <div className="border-t border-gray-100 pt-4 mt-2 col-span-2 space-y-3">
      <p className="text-sm font-medium text-gray-700">Update CV</p>

      {currentCvOriginalName && (
        <p className="text-sm text-gray-500">
          Current:{' '}
          {viewUrl ? (
            <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {currentCvOriginalName}
            </a>
          ) : (
            <span>{currentCvOriginalName}</span>
          )}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSuccess(false); setError('') }}
          className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
        />
        <Button
          type="button"
          disabled={!file || loading}
          onClick={handleUpload}
        >
          {loading ? 'Parsing CV…' : 'Upload & Re-parse CV'}
        </Button>
      </div>

      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          CV updated and profile re-parsed — fields have been refreshed. Review and save to confirm.
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
