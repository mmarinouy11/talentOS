'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function SystemGmailSection({ connectedEmail, toast }: { connectedEmail: string | null; toast?: string | null }) {
  const [email, setEmail] = useState(connectedEmail)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function disconnect() {
    if (!confirm('Disconnect the system Gmail account? Feedback notifications will stop sending.')) return
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/system-gmail/disconnect', { method: 'POST' })
      if (!res.ok) { setError('Failed to disconnect'); return }
      setEmail(null)
    } catch {
      setError('Network error')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 max-w-2xl space-y-3">
      <div>
        <Label>System Notification Email</Label>
        <p className="text-xs text-gray-500 mt-0.5">
          This Gmail account sends internal system notifications (e.g. feedback alerts) to recruiters. Separate from personal Gmail connections.
        </p>
      </div>

      {toast === 'connected' && (
        <p className="text-sm text-green-600">System Gmail connected successfully.</p>
      )}
      {toast === 'error' && (
        <p className="text-sm text-red-600">Failed to connect Gmail — please try again.</p>
      )}

      {email ? (
        <div className="flex items-center gap-3">
          <span className="text-green-600">✓</span>
          <span className="text-sm text-gray-700">Connected as <strong>{email}</strong></span>
          <button
            type="button"
            onClick={disconnect}
            disabled={disconnecting}
            className="ml-2 text-xs text-red-500 hover:text-red-700 underline disabled:opacity-40"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <a href="/api/auth/system-gmail/connect">
          <Button type="button" variant="outline" size="sm">Connect Gmail</Button>
        </a>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
