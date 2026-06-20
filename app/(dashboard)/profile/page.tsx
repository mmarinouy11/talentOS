'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface UserProfile {
  id: string
  name: string | null
  email: string
  calendarLink: string | null
  role: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [calendarLink, setCalendarLink] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data: UserProfile) => {
        setProfile(data)
        setName(data.name ?? '')
        setCalendarLink(data.calendarLink ?? '')
      })
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, calendarLink: calendarLink || null }),
      })
      const data = await res.json()
      if (res.ok) {
        setProfile(data)
        setFeedback({ ok: true, msg: 'Saved' })
      } else {
        setFeedback({ ok: false, msg: data.error ?? 'Failed to save' })
      }
    } catch {
      setFeedback({ ok: false, msg: 'Network error' })
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return <p className="text-sm text-gray-400">Loading…</p>

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your personal settings.</p>
      </div>

      <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={profile.email} disabled className="mt-1 bg-gray-50 text-gray-500" />
          <p className="text-xs text-gray-400 mt-1">Email cannot be changed here.</p>
        </div>

        <div>
          <Label htmlFor="calendarLink">Calendar Booking Link</Label>
          <Input
            id="calendarLink"
            type="url"
            value={calendarLink}
            onChange={(e) => setCalendarLink(e.target.value)}
            placeholder="https://calendly.com/yourname or Google appointment link"
            className="mt-1"
          />
          <p className="text-xs text-gray-400 mt-1">
            Used for Screening interviews. Paste your Google Calendar appointment scheduling link or Calendly link here.
          </p>
        </div>

        {feedback && (
          <p className={`text-sm ${feedback.ok ? 'text-green-600' : 'text-red-600'}`}>{feedback.msg}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </div>
  )
}
