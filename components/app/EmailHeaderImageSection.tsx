'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function EmailHeaderImageSection({ currentUrl }: { currentUrl: string }) {
  const [url, setUrl] = useState(currentUrl)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/email-header-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
      setUrl(data.url)
    } catch {
      setError('Network error')
    } finally {
      setUploading(false)
    }
  }

  async function remove() {
    if (!confirm('Remove the email header image?')) return
    setRemoving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/email-header-image', { method: 'DELETE' })
      if (!res.ok) { setError('Failed to remove'); return }
      setUrl('')
    } catch {
      setError('Network error')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 max-w-2xl">
      <Label>Email Header Image</Label>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        Shown at the top of all outgoing candidate and interviewer emails. Recommended width: 600px.
      </p>

      <input
        id="header-image-upload"
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={uploading}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />

      {url ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Email header preview" className="max-h-24 rounded border border-gray-200 object-contain" />
          <div className="flex gap-2">
            <label htmlFor="header-image-upload" className="cursor-pointer">
              <span className={`inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? 'Uploading…' : 'Replace'}
              </span>
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={removing} className="text-red-600 hover:text-red-700">
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor="header-image-upload"
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 bg-gray-50 px-4 py-6 cursor-pointer transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {uploading ? (
            <p className="text-sm text-gray-500">Uploading…</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 font-medium">Click to upload header image</p>
              <p className="text-xs text-gray-400">PNG, JPG, GIF, WebP · max 5 MB · recommended 600px wide</p>
            </>
          )}
        </label>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
