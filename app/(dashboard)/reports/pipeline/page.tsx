'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renderPipelineHtml } from '@/lib/pipeline-report'
import type { PipelineReportData } from '@/lib/pipeline-report'

type Preset = '7' | '14' | '30' | 'custom'

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function presetDates(preset: Preset): { from: string; to: string } {
  const to = new Date(); to.setUTCHours(23, 59, 59, 999)
  const from = new Date(); from.setUTCHours(0, 0, 0, 0)
  if (preset === '7') from.setUTCDate(from.getUTCDate() - 6)
  if (preset === '14') from.setUTCDate(from.getUTCDate() - 13)
  if (preset === '30') from.setUTCDate(from.getUTCDate() - 29)
  return { from: toDateInput(from), to: toDateInput(to) }
}

function SendEmailModal({
  onClose,
  onSend,
  defaultTo,
  subject,
}: {
  onClose: () => void
  onSend: (to: string) => Promise<void>
  defaultTo: string
  subject: string
}) {
  const [to, setTo] = useState(defaultTo)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSend() {
    setSending(true); setError('')
    try {
      await onSend(to)
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Send Pipeline Report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {sent ? (
          <div className="text-center py-4">
            <p className="text-green-600 font-medium">Report sent!</p>
            <Button className="mt-4" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">To</label>
              <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@example.com" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Subject</label>
              <p className="text-sm text-gray-500 bg-gray-50 rounded px-3 py-2">{subject}</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSend} disabled={sending || !to}>
                {sending ? 'Sending…' : 'Send Report'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function PipelineReportPage() {
  const [preset, setPreset] = useState<Preset>('7')
  const { from: defaultFrom, to: defaultTo } = presetDates('7')
  const [fromDate, setFromDate] = useState(defaultFrom)
  const [toDate, setToDate] = useState(defaultTo)
  const [data, setData] = useState<PipelineReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showEmail, setShowEmail] = useState(false)

  function handlePreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') {
      const { from, to } = presetDates(p)
      setFromDate(from)
      setToDate(to)
    }
  }

  const fetchReport = useCallback(async () => {
    setLoading(true); setError(''); setData(null)
    try {
      const params = new URLSearchParams({ from: `${fromDate}T00:00:00.000Z`, to: `${toDate}T23:59:59.999Z` })
      const res = await fetch(`/api/reports/pipeline?${params}`)
      if (!res.ok) throw new Error('Failed to load report')
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading report')
    } finally { setLoading(false) }
  }, [fromDate, toDate])

  function openPdf() {
    const params = new URLSearchParams({ from: `${fromDate}T00:00:00.000Z`, to: `${toDate}T23:59:59.999Z` })
    window.open(`/reports/pipeline/preview?${params}`, '_blank')
  }

  async function sendReport(to: string) {
    if (!data) return
    const html = renderPipelineHtml(data, { emailMode: true })
    const from = new Date(data.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const subject = `Pipeline Report — Tenarai LATAM — ${from}`
    const res = await fetch('/api/reports/pipeline/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Send failed')
    }
  }

  const previewHtml = data ? renderPipelineHtml(data) : null
  const emailSubject = data
    ? `Pipeline Report — Tenarai LATAM — ${new Date(data.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pipeline Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">All open positions grouped by client</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activity period</p>
            <div className="flex gap-1.5">
              {(['7', '14', '30'] as Preset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePreset(p)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${preset === p ? 'border-[#8CF000] bg-[#8CF000]/10 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Last {p}d
                </button>
              ))}
              <button
                onClick={() => handlePreset('custom')}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${preset === 'custom' ? 'border-[#8CF000] bg-[#8CF000]/10 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Custom
              </button>
            </div>
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
              <span className="text-gray-400 text-sm">to</span>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
            </div>
          )}

          <div className="flex gap-2 ml-auto">
            <Button onClick={fetchReport} disabled={loading}>
              {loading ? 'Loading…' : 'Preview Report'}
            </Button>
            <Button variant="outline" onClick={openPdf}>Download PDF</Button>
            <Button
              variant="outline"
              onClick={() => setShowEmail(true)}
              disabled={!data}
            >
              Send by Email
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Inline preview */}
      {previewHtml && (
        <div
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      {!previewHtml && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">Click "Preview Report" to generate the pipeline report.</p>
        </div>
      )}

      {showEmail && (
        <SendEmailModal
          onClose={() => setShowEmail(false)}
          onSend={sendReport}
          defaultTo=""
          subject={emailSubject}
        />
      )}
    </div>
  )
}
