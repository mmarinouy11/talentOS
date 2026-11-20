'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type Summary = { kept: number; newCount: number; deactivated: number; discardedFilled?: number; otherLocations: string[] }

export function OpportunityImportForm() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Summary | null>(null)

  async function upload() {
    if (!file) return
    setBusy(true); setError(''); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/opportunities/import', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Import failed'); return }
      setResult(data)
      router.refresh()
    } catch {
      setError('Import failed — check your connection')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Upload the daily .xlsx (sheet &quot;Base Data&quot;). Discarded rows are only counted, never stored. Matching against the Redeployment pool starts automatically.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError('') }} className="text-sm" />
        <Button size="sm" onClick={upload} disabled={!file || busy}>{busy ? 'Importing…' : 'Import'}</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <p className="text-sm text-[#2F2C29]">
          Imported: {result.kept} kept, {result.newCount} new, {result.deactivated} deactivated{(result.discardedFilled ?? 0) > 0 ? `, ${result.discardedFilled} headcount covered (offered / YTJ)` : ''}.
          {result.otherLocations.length > 0 && <span className="block text-amber-700">Other locations discarded: {result.otherLocations.join(', ')}</span>}
        </p>
      )}
    </div>
  )
}
