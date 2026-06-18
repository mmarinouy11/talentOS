'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CVUpload, type ParsedCV } from './CVUpload'

interface CvSectionProps {
  candidateId: string
  cvDriveId: string | null
  cvOriginalName: string | null
}

export function CvSection({ candidateId, cvDriveId, cvOriginalName }: CvSectionProps) {
  const router = useRouter()
  const [showUpload, setShowUpload] = useState(false)
  const [replacing, setReplacing] = useState(false)

  async function handleParsed(parsed: ParsedCV, fileId: string, fileName: string) {
    setReplacing(true)
    try {
      const payload: Record<string, unknown> = {
        cvDriveId: fileId,
        cvOriginalName: fileName,
      }
      // Also update parsed fields if available
      if (parsed.firstName) payload.firstName = parsed.firstName
      if (parsed.lastName) payload.lastName = parsed.lastName
      if (parsed.email) payload.email = parsed.email
      if (parsed.phone) payload.phone = parsed.phone
      if (parsed.country) payload.country = parsed.country
      if (parsed.seniority) payload.seniority = parsed.seniority
      if (parsed.yearsOfExperience != null) payload.yearsOfExperience = parsed.yearsOfExperience
      if (parsed.skills.length) payload.skills = parsed.skills
      if (parsed.languages.length) payload.languages = parsed.languages

      await fetch(`/api/candidates/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      router.refresh()
    } finally {
      setReplacing(false)
      setShowUpload(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-medium text-gray-900">CV</h2>
      {cvDriveId ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm text-gray-700 truncate">{cvOriginalName ?? 'CV file'}</span>
          </div>
          <div className="flex gap-2">
            <a
              href={`https://drive.google.com/file/d/${cvDriveId}/view`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button type="button" variant="outline" size="sm">
                View CV
              </Button>
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUpload((v) => !v)}
              disabled={replacing}
            >
              Replace CV
            </Button>
          </div>
          {showUpload && (
            <CVUpload onParsed={handleParsed} className="mt-2" />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">No CV uploaded yet.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowUpload((v) => !v)}
          >
            Upload CV
          </Button>
          {showUpload && (
            <CVUpload onParsed={handleParsed} className="mt-2" />
          )}
        </div>
      )}
    </div>
  )
}
