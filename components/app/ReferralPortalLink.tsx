'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ReferralPortalLinkProps {
  vendorId: string
  initialToken: string | null
}

export function ReferralPortalLink({ vendorId, initialToken }: ReferralPortalLinkProps) {
  const [token, setToken] = useState(initialToken)
  const [copying, setCopying] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [copyDone, setCopyDone] = useState(false)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const referralUrl = token ? `${baseUrl}/refer/${token}` : null

  async function handleCopy() {
    if (!referralUrl) return
    setCopying(true)
    await navigator.clipboard.writeText(referralUrl)
    setCopyDone(true)
    setCopying(false)
    setTimeout(() => setCopyDone(false), 2000)
  }

  async function handleRegenerate() {
    if (!confirm('Regenerate the referral link? The previous link will stop working immediately.')) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/vendors/${vendorId}/regenerate-referral-token`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setToken(data.referralToken)
      }
    } finally {
      setRegenerating(false)
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-gray-400 italic">
        No referral link yet — regenerate below.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={referralUrl ?? ''}
          className="flex-1 text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 select-all"
          onFocus={(e) => e.target.select()}
        />
        <Button type="button" variant="outline" onClick={handleCopy} disabled={copying}>
          {copyDone ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={handleRegenerate}
        disabled={regenerating}
        className="text-amber-600 border-amber-200 hover:bg-amber-50"
      >
        {regenerating ? 'Regenerating…' : 'Regenerate Referral Link'}
      </Button>
      <p className="text-xs text-gray-400">
        Share this link with referrers so they can submit candidates. Regenerating it invalidates the previous link immediately.
      </p>
    </div>
  )
}
