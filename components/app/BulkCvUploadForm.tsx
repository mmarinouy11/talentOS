'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const MAX_FILES = 50
const MAX_BYTES = 10 * 1024 * 1024

type Rejected = { fileName: string; error: string }

function checkFile(f: File): string | null {
  const ext = f.name.toLowerCase().split('.').pop()
  if (ext !== 'pdf' && ext !== 'docx') return 'Only PDF and DOCX files are supported'
  if (f.size > MAX_BYTES) return 'File too large (max 10 MB)'
  if (f.size === 0) return 'File is empty'
  return null
}

// Upload step of a bulk CV batch: returns as soon as the files are stored; processing runs in the background.
// positionId set → batch for that position; otherwise talent pool only.
export function BulkCvUploadForm({ positionId, onClose }: { positionId?: string; onClose?: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ id: string; totalFiles: number; rejected: Rejected[] } | null>(null)

  const invalid = files.map((f) => ({ f, err: checkFile(f) })).filter((x) => x.err)
  const valid = files.filter((f) => !checkFile(f))
  const tooMany = valid.length > MAX_FILES

  async function upload() {
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      for (const f of valid) fd.append('files', f)
      if (positionId) fd.append('positionId', positionId)
      const res = await fetch('/api/bulk-uploads', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
      setResult({ id: data.id, totalFiles: data.totalFiles, rejected: [...invalid.map((x) => ({ fileName: x.f.name, error: x.err! })), ...(data.rejected ?? [])] })
    } catch {
      setError('Upload failed — check your connection and try again')
    } finally {
      setUploading(false)
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#8CF000] bg-[#F5F0EB] px-4 py-3">
          <p className="text-sm font-medium text-[#2F2C29]">
            Processing {result.totalFiles} CV{result.totalFiles === 1 ? '' : 's'} — we&apos;ll let you know when they&apos;re ready to review.
          </p>
          <p className="text-xs text-gray-600 mt-1">You can close this window. The batch will appear on your home screen when it&apos;s ready.</p>
        </div>
        {result.rejected.length > 0 && <RejectedList rows={result.rejected} />}
        <div className="flex justify-end gap-2">
          <Link href={`/bulk-uploads/${result.id}`}><Button variant="outline" size="sm">View progress</Button></Link>
          {onClose && <Button size="sm" onClick={onClose}>Close</Button>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {positionId
          ? 'Upload up to 50 CVs (PDF or DOCX, max 10 MB each). Each CV is parsed, matched against existing candidates and scored for this position; you choose who joins the pipeline.'
          : 'Upload up to 50 CVs (PDF or DOCX, max 10 MB each). New candidates are added to the talent pool; existing ones are matched and left unchanged.'}
      </p>
      <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-8 text-center cursor-pointer hover:bg-[#F5F0EB] transition-colors">
        <span className="text-sm font-medium text-[#2F2C29]">Choose CV files</span>
        <span className="text-xs text-gray-500 mt-1">PDF or DOCX · scanned PDFs are fine</span>
        <input
          type="file" multiple accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setError('') }}
        />
      </label>
      {files.length > 0 && (
        <p className="text-sm text-gray-700">
          {valid.length} file{valid.length === 1 ? '' : 's'} ready{invalid.length > 0 ? ` · ${invalid.length} will be skipped` : ''}
        </p>
      )}
      {tooMany && <p className="text-sm text-red-600">Up to {MAX_FILES} files per batch — remove {valid.length - MAX_FILES}.</p>}
      {invalid.length > 0 && <RejectedList rows={invalid.map((x) => ({ fileName: x.f.name, error: x.err! }))} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        {onClose && <Button variant="outline" size="sm" onClick={onClose} disabled={uploading}>Cancel</Button>}
        <Button size="sm" onClick={upload} disabled={uploading || valid.length === 0 || tooMany}>
          {uploading ? 'Uploading…' : `Upload ${valid.length || ''} CV${valid.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}

function RejectedList({ rows }: { rows: Rejected[] }) {
  return (
    <ul className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100 text-xs">
      {rows.map((r, i) => (
        <li key={i} className="flex justify-between gap-3 px-3 py-1.5">
          <span className="truncate text-gray-700">{r.fileName}</span>
          <span className="shrink-0 text-red-600">{r.error}</span>
        </li>
      ))}
    </ul>
  )
}
