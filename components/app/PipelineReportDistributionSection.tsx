'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Cadence = 'daily' | 'weekly' | 'custom'

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
]

interface Props {
  enabled: boolean
  emails: string[]
  sendTime: string
  periodDays: number
  cadence: Cadence
  weeklyDay: number
}

async function saveSetting(key: string, value: string) {
  await fetch(`/api/settings/${key}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
}

const CADENCE_OPTIONS: { value: Cadence; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Weekly', description: 'Every Monday' },
  { value: 'custom', label: 'Custom', description: 'Configure schedule manually' },
]

const CADENCE_DEFAULTS: Record<Cadence, { sendTime: string; periodDays: number }> = {
  daily:  { sendTime: '17:00', periodDays: 1 },
  weekly: { sendTime: '09:00', periodDays: 7 },
  custom: { sendTime: '17:00', periodDays: 7 },
}

function fmtTime(sendTime: string): string {
  const [h, m] = sendTime.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function cadenceSummary(cadence: Cadence, sendTime: string, weeklyDay: number): string {
  const timeFmt = fmtTime(sendTime)
  if (cadence === 'daily') return `Sends every weekday at ${timeFmt} (GMT-3)`
  if (cadence === 'weekly') {
    const dayLabel = WEEKDAY_OPTIONS.find((d) => d.value === weeklyDay)?.label ?? 'Monday'
    return `Sends every ${dayLabel} at ${timeFmt} (GMT-3)`
  }
  return ''
}

export function PipelineReportDistributionSection({
  enabled: initEnabled,
  emails: initEmails,
  sendTime: initSendTime,
  periodDays: initPeriodDays,
  cadence: initCadence,
  weeklyDay: initWeeklyDay,
}: Props) {
  const [enabled, setEnabled] = useState(initEnabled)
  const [emails, setEmails] = useState<string[]>(initEmails)
  const [cadence, setCadence] = useState<Cadence>(initCadence)
  const [sendTime, setSendTime] = useState(initSendTime)
  const [periodDays, setPeriodDays] = useState(initPeriodDays)
  const [weeklyDay, setWeeklyDay] = useState(initWeeklyDay)
  const [showTimeOverride, setShowTimeOverride] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sendingNow, setSendingNow] = useState(false)
  const [sendNowStatus, setSendNowStatus] = useState<string | null>(null)

  const timeOptions: string[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      timeOptions.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }

  function handleCadenceChange(next: Cadence) {
    setCadence(next)
    setShowTimeOverride(false)
    if (next !== 'custom') {
      setSendTime(CADENCE_DEFAULTS[next].sendTime)
      setPeriodDays(CADENCE_DEFAULTS[next].periodDays)
    }
  }

  function validateEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  }

  function addEmail() {
    const trimmed = newEmail.trim().toLowerCase()
    if (!validateEmail(trimmed)) { setEmailError('Invalid email address'); return }
    if (emails.includes(trimmed)) { setEmailError('Already in the list'); return }
    setEmailError('')
    setNewEmail('')
    const next = [...emails, trimmed]
    setEmails(next)
    saveSetting('PIPELINE_REPORT_EMAILS', JSON.stringify(next))
  }

  function removeEmail(email: string) {
    const next = emails.filter((e) => e !== email)
    setEmails(next)
    saveSetting('PIPELINE_REPORT_EMAILS', JSON.stringify(next))
  }

  async function saveAll() {
    setSaving(true); setSaved(false)
    await Promise.all([
      saveSetting('PIPELINE_REPORT_ENABLED', String(enabled)),
      saveSetting('PIPELINE_REPORT_CADENCE', cadence),
      saveSetting('PIPELINE_REPORT_SEND_TIME', sendTime),
      saveSetting('PIPELINE_REPORT_PERIOD_DAYS', String(periodDays)),
      saveSetting('PIPELINE_REPORT_EMAILS', JSON.stringify(emails)),
      saveSetting('PIPELINE_REPORT_WEEKLY_DAY', String(weeklyDay)),
    ])
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function sendNow() {
    setSendingNow(true); setSendNowStatus(null)
    try {
      const res = await fetch('/api/admin/trigger-pipeline-report', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) setSendNowStatus(`Error: ${body.error ?? 'Failed'}`)
      else setSendNowStatus(`Sent to ${body.sent} recipient${body.sent !== 1 ? 's' : ''}`)
    } catch {
      setSendNowStatus('Network error')
    } finally {
      setSendingNow(false)
    }
  }

  const summary = cadence !== 'custom' ? cadenceSummary(cadence, sendTime, weeklyDay) : ''

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Pipeline Report Distribution</h2>
        <p className="text-sm text-gray-500 mt-0.5">Automatically send the pipeline report by email.</p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#8CF000] focus:ring-offset-2 ${enabled ? 'bg-[#8CF000]' : 'bg-gray-200'}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
        <Label className="cursor-pointer select-none" onClick={() => setEnabled((v) => !v)}>
          Enable pipeline report emails
        </Label>
      </div>

      {/* Cadence selector */}
      <div className="space-y-2">
        <Label>Cadence</Label>
        <div className="flex gap-3">
          {CADENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleCadenceChange(opt.value)}
              className={`flex-1 rounded-lg border px-4 py-3 text-left transition-all focus:outline-none ${
                cadence === opt.value
                  ? 'border-2 border-[#8CF000] bg-lime-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <p className="text-sm font-medium text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>

        {/* Day-of-week selector for weekly cadence */}
        {cadence === 'weekly' && (
          <div className="flex items-center gap-2 pt-1">
            <Label className="shrink-0">Send on:</Label>
            <select
              value={weeklyDay}
              onChange={(e) => setWeeklyDay(Number(e.target.value))}
              className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8CF000]"
            >
              {WEEKDAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Summary for non-custom cadences */}
        {cadence !== 'custom' && (
          <div className="flex items-center gap-2 text-sm text-gray-600 pt-1">
            <span>{summary}</span>
            {!showTimeOverride && (
              <button
                type="button"
                onClick={() => setShowTimeOverride(true)}
                className="text-xs text-[#5a9a00] hover:underline"
              >
                Change time
              </button>
            )}
          </div>
        )}

        {/* Time picker — shown in custom mode or when override requested */}
        {(cadence === 'custom' || showTimeOverride) && (
          <div className="space-y-1.5 pt-1">
            <Label>Send time <span className="text-gray-400 font-normal">(GMT-3 / Montevideo)</span></Label>
            <select
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8CF000]"
            >
              {timeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        {/* Period days — custom only */}
        {cadence === 'custom' && (
          <div className="space-y-1.5 pt-1">
            <Label>Activity period (days back)</Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={periodDays}
              onChange={(e) => setPeriodDays(Math.max(1, Math.min(90, Number(e.target.value) || 7)))}
              className="w-24"
            />
            <p className="text-xs text-gray-400">The report will include activity from the last N days.</p>
          </div>
        )}
      </div>

      {/* Recipients */}
      <div className="space-y-2">
        <Label>Recipients</Label>
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {emails.map((email) => (
              <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-sm text-gray-700">
                {email}
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  className="text-gray-400 hover:text-gray-700 leading-none"
                  aria-label={`Remove ${email}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              type="email"
              placeholder="name@example.com"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setEmailError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
              className="w-full max-w-xs"
            />
            {emailError && <p className="text-xs text-red-500">{emailError}</p>}
          </div>
          <Button type="button" variant="outline" onClick={addEmail} className="shrink-0">Add</Button>
        </div>
        {emails.length === 0 && (
          <p className="text-xs text-gray-400">Add at least one recipient to enable sending.</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <Button onClick={saveAll} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
        </Button>
        <Button
          variant="outline"
          onClick={sendNow}
          disabled={sendingNow || emails.length === 0}
          title={emails.length === 0 ? 'Add at least one recipient first' : 'Send the report right now'}
        >
          {sendingNow ? 'Sending…' : 'Send Now'}
        </Button>
        {sendNowStatus && (
          <span className={`text-sm ${sendNowStatus.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
            {sendNowStatus}
          </span>
        )}
      </div>
    </div>
  )
}
