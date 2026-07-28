'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface ParsedCV {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  country: string | null
  linkedinUrl: string | null
  seniority: 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL' | null
  yearsOfExperience: number | null
  skills: string[]
  languages: string[]
  summary: string | null
  experience?: { title: string; company: string; startDate: string; endDate: string; bullets: string[] }[]
  education?: { degree: string; institution: string; year?: string }[]
}

interface CVUploadProps {
  onParsed: (data: ParsedCV, driveFileId: string, driveFileName: string) => void
  onError?: (error: string) => void
  className?: string
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export function CVUpload({ onParsed, onError, className }: CVUploadProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.match(/\.(pdf|docx)$/i)) {
      const msg = 'Only PDF and DOCX files are supported'
      setErrorMsg(msg)
      setState('error')
      onError?.(msg)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      const msg = 'File too large (max 10MB)'
      setErrorMsg(msg)
      setState('error')
      onError?.(msg)
      return
    }

    setFileName(file.name)
    setState('uploading')

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch('/api/cv/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed')
      }
      setState('success')
      onParsed(data.parsed, data.driveFileId, data.driveFileName)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setErrorMsg(msg)
      setState('error')
      onError?.(msg)
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className={className}>
      <div
        onClick={() => state !== 'uploading' && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-gray-400 bg-gray-50' :
          state === 'success' ? 'border-green-300 bg-green-50' :
          state === 'error' ? 'border-red-300 bg-red-50' :
          'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        {state === 'idle' && (
          <>
            <p className="text-sm text-gray-600 font-medium">Drop CV here or click to upload</p>
            <p className="text-xs text-gray-400 mt-1">PDF or DOCX · max 10MB</p>
          </>
        )}
        {state === 'uploading' && (
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-sm text-gray-600">Parsing CV with AI…</span>
          </div>
        )}
        {state === 'success' && (
          <div className="flex items-center justify-center gap-2 text-green-700">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
            </svg>
            <span className="text-sm font-medium">{fileName}</span>
          </div>
        )}
        {state === 'error' && (
          <div className="text-red-600">
            <p className="text-sm font-medium">{errorMsg}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={(e) => { e.stopPropagation(); setState('idle') }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  )
}
