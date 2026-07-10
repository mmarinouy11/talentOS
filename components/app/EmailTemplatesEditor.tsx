'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TemplateOverride {
  subject: string
  htmlBody: string
  updatedAt: string
}

interface TemplateEntry {
  key: string
  name: string
  description: string
  placeholders: readonly string[]
  override: TemplateOverride | null
}

function TemplateRow({ template }: { template: TemplateEntry }) {
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(template.override?.subject ?? '')
  const [htmlBody, setHtmlBody] = useState(template.override?.htmlBody ?? '')
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [hasOverride, setHasOverride] = useState(!!template.override)
  const [overrideDate, setOverrideDate] = useState(template.override?.updatedAt ?? null)

  async function save() {
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/settings/email-templates/${template.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, htmlBody }),
      })
      if (res.ok) {
        const data = await res.json()
        setHasOverride(true)
        setOverrideDate(data.updatedAt)
        setFeedback({ ok: true, msg: 'Template saved.' })
      } else {
        const data = await res.json().catch(() => ({}))
        setFeedback({ ok: false, msg: data.error ?? 'Failed to save' })
      }
    } catch {
      setFeedback({ ok: false, msg: 'Network error' })
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!confirm('Reset this template to its built-in default? The override will be deleted.')) return
    setResetting(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/settings/email-templates/${template.key}`, { method: 'DELETE' })
      if (res.ok) {
        setHasOverride(false)
        setOverrideDate(null)
        setSubject('')
        setHtmlBody('')
        setFeedback({ ok: true, msg: 'Reset to default.' })
      } else {
        setFeedback({ ok: false, msg: 'Failed to reset' })
      }
    } catch {
      setFeedback({ ok: false, msg: 'Network error' })
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900">{template.name}</p>
            {hasOverride ? (
              <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">Custom</span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Default</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          {hasOverride && overrideDate && (
            <p className="text-xs text-gray-400 mt-0.5">
              Last updated: {new Date(overrideDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
        <span className="text-gray-400 text-sm mt-0.5 shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <span className="font-medium">Available placeholders: </span>
            {template.placeholders.map((p) => (
              <code key={p} className="mr-1 bg-white border border-gray-200 rounded px-1">{`{{${p}}}`}</code>
            ))}
          </div>

          <div>
            <Label htmlFor={`${template.key}-subject`}>Subject</Label>
            <Input
              id={`${template.key}-subject`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Leave blank to use default subject"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor={`${template.key}-body`}>HTML Body</Label>
            <textarea
              id={`${template.key}-body`}
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              placeholder="Leave blank to use default body"
              rows={10}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={saving || resetting}>
              {saving ? 'Saving…' : 'Save Override'}
            </Button>
            {hasOverride && (
              <Button type="button" variant="outline" onClick={reset} disabled={saving || resetting} className="text-red-600 border-red-200 hover:bg-red-50">
                {resetting ? 'Resetting…' : 'Reset to Default'}
              </Button>
            )}
            {feedback && (
              <span className={`text-sm ${feedback.ok ? 'text-green-600' : 'text-red-600'}`}>{feedback.msg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function EmailTemplatesEditor({ templates }: { templates: TemplateEntry[] }) {
  return (
    <div className="space-y-3 max-w-3xl">
      {templates.map((t) => (
        <TemplateRow key={t.key} template={t} />
      ))}
    </div>
  )
}
