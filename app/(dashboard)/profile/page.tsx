'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_SCHEDULING_TEMPLATE,
  DEFAULT_REJECTION_TEMPLATE,
  DEFAULT_ADVANCE_TEMPLATE,
} from '@/lib/email-templates'
import { RECRUITER_TIMEZONES } from '@/lib/timezone'

interface UserProfile {
  id: string
  name: string | null
  email: string
  calendarLink: string | null
  timezone: string | null
  role: string
  schedulingEmailTemplate: string | null
  rejectionEmailTemplate: string | null
  advanceEmailTemplate: string | null
  gmailConnectedEmail: string | null
}

const TEMPLATE_TOKENS: Record<string, string[]> = {
  scheduling: ['{{candidateName}}', '{{positionTitle}}', '{{clientName}}', '{{recruiterName}}', '{{roundLabel}}', '{{schedulingLink}}'],
  rejection: ['{{candidateName}}', '{{positionTitle}}', '{{clientName}}', '{{recruiterName}}'],
  advance: ['{{candidateName}}', '{{positionTitle}}', '{{clientName}}', '{{recruiterName}}', '{{nextRoundLabel}}', '{{schedulingLink}}'],
}

function TemplateEditor({
  label,
  tokenKey,
  value,
  defaultValue,
  onChange,
}: {
  label: string
  tokenKey: string
  value: string
  defaultValue: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Reset to Default
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="block w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#8CF000]"
      />
      <p className="text-xs text-gray-400">
        Available tokens: {TEMPLATE_TOKENS[tokenKey].join(', ')}
      </p>
    </div>
  )
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [calendarLink, setCalendarLink] = useState('')
  const [schedulingTemplate, setSchedulingTemplate] = useState(DEFAULT_SCHEDULING_TEMPLATE)
  const [rejectionTemplate, setRejectionTemplate] = useState(DEFAULT_REJECTION_TEMPLATE)
  const [advanceTemplate, setAdvanceTemplate] = useState(DEFAULT_ADVANCE_TEMPLATE)
  const [timezone, setTimezone] = useState('America/Montevideo')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [gmailToast, setGmailToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data: UserProfile) => {
        setProfile(data)
        setName(data.name ?? '')
        setCalendarLink(data.calendarLink ?? '')
        setTimezone(data.timezone ?? 'America/Montevideo')
        setSchedulingTemplate(data.schedulingEmailTemplate ?? DEFAULT_SCHEDULING_TEMPLATE)
        setRejectionTemplate(data.rejectionEmailTemplate ?? DEFAULT_REJECTION_TEMPLATE)
        setAdvanceTemplate(data.advanceEmailTemplate ?? DEFAULT_ADVANCE_TEMPLATE)
      })
  }, [])

  useEffect(() => {
    const gmail = searchParams.get('gmail')
    if (gmail === 'connected') {
      setGmailToast({ ok: true, msg: 'Gmail connected successfully.' })
      // Refresh profile to get gmailConnectedEmail
      fetch('/api/profile').then((r) => r.json()).then((data: UserProfile) => setProfile(data))
      router.replace('/profile')
    } else if (gmail === 'error') {
      setGmailToast({ ok: false, msg: 'Failed to connect Gmail. Please try again.' })
      router.replace('/profile')
    }
  }, [searchParams, router])

  const handleDisconnectGmail = useCallback(async () => {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/auth/gmail/disconnect', { method: 'POST' })
      if (res.ok) {
        setProfile((prev) => prev ? { ...prev, gmailConnectedEmail: null } : prev)
        setGmailToast({ ok: true, msg: 'Gmail disconnected.' })
      } else {
        setGmailToast({ ok: false, msg: 'Failed to disconnect Gmail.' })
      }
    } catch {
      setGmailToast({ ok: false, msg: 'Network error.' })
    } finally {
      setDisconnecting(false)
    }
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          calendarLink: calendarLink || null,
          timezone,
          schedulingEmailTemplate: schedulingTemplate === DEFAULT_SCHEDULING_TEMPLATE ? null : schedulingTemplate,
          rejectionEmailTemplate: rejectionTemplate === DEFAULT_REJECTION_TEMPLATE ? null : rejectionTemplate,
          advanceEmailTemplate: advanceTemplate === DEFAULT_ADVANCE_TEMPLATE ? null : advanceTemplate,
        }),
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your personal settings and email templates.</p>
      </div>

      <form onSubmit={save} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-medium text-gray-900">Account</h2>

          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile.email} disabled className="mt-1 bg-gray-50 text-gray-500" />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed here.</p>
          </div>

          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8CF000]"
            >
              {RECRUITER_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Default timezone used when entering interview time slots.</p>
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
        </div>

        {/* Email Sending */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-gray-900">Email Sending</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Connect your Gmail account to send candidate emails from your own address.
            </p>
          </div>

          {gmailToast && (
            <p className={`text-sm ${gmailToast.ok ? 'text-green-600' : 'text-red-600'}`}>{gmailToast.msg}</p>
          )}

          {profile?.gmailConnectedEmail ? (
            <div className="flex items-center gap-3">
              <span className="text-green-600">&#10003;</span>
              <span className="text-sm text-gray-700">Connected as <strong>{profile.gmailConnectedEmail}</strong></span>
              <button
                type="button"
                onClick={handleDisconnectGmail}
                disabled={disconnecting}
                className="ml-2 text-xs text-red-500 hover:text-red-700 underline disabled:opacity-40"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <a href="/api/auth/gmail/connect">
              <Button type="button" variant="outline" size="sm">Connect Gmail</Button>
            </a>
          )}
        </div>

        {/* Email Templates */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div>
            <h2 className="text-sm font-medium text-gray-900">Email Templates</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Customize the emails sent to candidates. Use tokens (e.g. {'{{candidateName}}'}) for dynamic content.
            </p>
          </div>

          <TemplateEditor
            label="Scheduling Request"
            tokenKey="scheduling"
            value={schedulingTemplate}
            defaultValue={DEFAULT_SCHEDULING_TEMPLATE}
            onChange={setSchedulingTemplate}
          />

          <div className="border-t border-gray-100 pt-4">
            <TemplateEditor
              label="Rejection"
              tokenKey="rejection"
              value={rejectionTemplate}
              defaultValue={DEFAULT_REJECTION_TEMPLATE}
              onChange={setRejectionTemplate}
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <TemplateEditor
              label="Advance Notification"
              tokenKey="advance"
              value={advanceTemplate}
              defaultValue={DEFAULT_ADVANCE_TEMPLATE}
              onChange={setAdvanceTemplate}
            />
          </div>
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
