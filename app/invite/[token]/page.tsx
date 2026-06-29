'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type PageState = 'loading' | 'invalid' | 'used' | 'expired' | 'ready' | 'done'

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()

  const [state, setState] = useState<PageState>('loading')
  const [message, setMessage] = useState('')
  const [userName, setUserName] = useState('')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.invalid || d.state === 'invalid') { setState('invalid'); setMessage(d.error ?? 'Invalid link.'); return }
        if (d.used || d.state === 'used') { setState('used'); setMessage(d.error ?? 'Already used.'); return }
        if (d.expired || d.state === 'expired') { setState('expired'); setMessage(d.error ?? 'Link expired.'); return }
        setUserName(d.userName ?? '')
        setState('ready')
      })
      .catch(() => { setState('invalid'); setMessage('Could not load invitation.') })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (password.length < 8) { setFormError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setFormError('Passwords do not match.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'Something went wrong.'); return }
      setState('done')
      setTimeout(() => router.push('/login'), 2500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">TalentOS</h1>

        {state === 'loading' && (
          <p className="text-sm text-gray-500">Loading…</p>
        )}

        {(state === 'invalid' || state === 'expired') && (
          <div className="mt-4">
            <p className="text-sm text-red-600">{message || 'This invitation link is invalid or has expired.'}</p>
            {state === 'expired' && (
              <p className="text-sm text-gray-500 mt-2">Please contact your administrator for a new invitation.</p>
            )}
          </div>
        )}

        {state === 'used' && (
          <div className="mt-4">
            <p className="text-sm text-gray-700">{message || 'This invitation has already been used.'}</p>
            <a href="/login" className="mt-3 inline-block text-sm text-blue-600 hover:underline">Go to login →</a>
          </div>
        )}

        {state === 'done' && (
          <div className="mt-4">
            <p className="text-sm text-green-700 font-medium">Password set! Redirecting to login…</p>
          </div>
        )}

        {state === 'ready' && (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-6">
              {userName ? `Hi ${userName}, set` : 'Set'} your password to get started.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Min. 8 characters"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-gray-900 text-white py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Setting password…' : 'Set Password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
