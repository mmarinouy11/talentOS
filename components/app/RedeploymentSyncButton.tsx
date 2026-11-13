'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function RedeploymentSyncButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function sync() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/redeployment/sync', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error ?? 'Sync failed')
      router.refresh()
    } catch {
      setError('Sync failed — check your connection')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={sync} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</Button>
      {error && <span className="text-xs text-red-600 max-w-xs text-right">{error}</span>}
    </div>
  )
}
