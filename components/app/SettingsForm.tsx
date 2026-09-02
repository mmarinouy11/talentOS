'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Setting {
  id: string
  key: string
  value: string
  description: string | null
}

const LABELS: Record<string, { label: string; type?: string; min?: number; max?: number }> = {
  MIN_DGM_PERCENT: { label: 'Minimum DGM Threshold (%)', type: 'number', min: 0, max: 100 },
  MONTHLY_HOURS_BASELINE: { label: 'Monthly Hours Baseline', type: 'number', min: 1, max: 744 },
  DEFAULT_DURATION_SCREENING_MANAGER: { label: 'Default Duration — Screening & Manager (minutes)', type: 'number', min: 5, max: 480 },
  DEFAULT_DURATION_OTHER: { label: 'Default Duration — Technical & Client (minutes)', type: 'number', min: 5, max: 480 },
  TECHNICAL_FEEDBACK_SKILL_LIMIT: { label: 'Technical Feedback Skill Limit', type: 'number', min: 1, max: 20 },
  VENDOR_MIN_FIT_SCORE: { label: 'Minimum Fit Score — Partner Submissions', type: 'number', min: 0, max: 100 },
  DIRECT_MIN_FIT_SCORE: { label: 'Minimum Fit Score — Direct Applications', type: 'number', min: 0, max: 100 },
}

function SettingRow({ setting }: { setting: Setting }) {
  const meta = LABELS[setting.key] ?? { label: setting.key }
  const [value, setValue] = useState(setting.value)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  async function save() {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/settings/${setting.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFeedback({ ok: false, msg: data.error ?? 'Failed to save' })
      } else {
        setFeedback({ ok: true, msg: 'Saved' })
      }
    } catch {
      setFeedback({ ok: false, msg: 'Network error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <Label htmlFor={setting.key}>{meta.label}</Label>
      {setting.description && (
        <p className="text-xs text-gray-500 mt-0.5 mb-2">{setting.description}</p>
      )}
      <div className="flex items-center gap-3 mt-1">
        <Input
          id={setting.key}
          type={meta.type ?? 'text'}
          min={meta.min}
          max={meta.max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-xs"
        />
        <Button type="button" onClick={save} disabled={saving || value === setting.value}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {feedback && (
          <span className={`text-sm ${feedback.ok ? 'text-green-600' : 'text-red-600'}`}>
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  )
}

const DISPLAY_ORDER = [
  'MIN_DGM_PERCENT',
  'MONTHLY_HOURS_BASELINE',
  'DEFAULT_DURATION_SCREENING_MANAGER',
  'DEFAULT_DURATION_OTHER',
  'VENDOR_MIN_FIT_SCORE',
  'DIRECT_MIN_FIT_SCORE',
]

export function SettingsForm({ settings }: { settings: Setting[] }) {
  const excluded = new Set(['EMAIL_HEADER_IMAGE_URL', 'SENDER_EMAIL', 'PIPELINE_REPORT_ENABLED', 'PIPELINE_REPORT_EMAILS', 'PIPELINE_REPORT_SEND_TIME', 'PIPELINE_REPORT_PERIOD_DAYS', 'PIPELINE_REPORT_CADENCE', 'PIPELINE_REPORT_WEEKLY_DAY'])
  const ordered = [
    ...DISPLAY_ORDER.map((key) => settings.find((s) => s.key === key)).filter(Boolean) as Setting[],
    ...settings.filter((s) => !excluded.has(s.key) && !DISPLAY_ORDER.includes(s.key)),
  ]
  if (ordered.length === 0) {
    return <p className="text-sm text-gray-400">No settings configured.</p>
  }
  return (
    <div className="space-y-4 max-w-2xl">
      {ordered.map((s) => (
        <SettingRow key={s.id} setting={s} />
      ))}
    </div>
  )
}
