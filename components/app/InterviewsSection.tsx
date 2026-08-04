'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_SCHEDULING_TEMPLATE,
  DEFAULT_REJECTION_TEMPLATE,
  DEFAULT_NEXT_ROUND_TEMPLATE,
  renderTemplate,
  buildSchedulingTokens,
} from '@/lib/email-templates'
import { getNextStage, STAGE_SEQUENCE } from '@/lib/pipeline'
import { RECRUITER_TIMEZONES, zonedToUtcIso } from '@/lib/timezone'

type InterviewStatus = 'PENDING' | 'AWAITING_SCHEDULE' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
type InterviewDecision = 'ADVANCE' | 'REJECT' | 'HOLD'
type PipelineStage = 'APPLIED' | 'SCREENING' | 'TECHNICAL_INTERVIEW' | 'MANAGER_INTERVIEW' | 'CLIENT_INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED'
type SchedulingMode = 'MANUAL_SLOTS' | 'CALENDAR_LINK'

interface Interview {
  id: string
  stage: PipelineStage
  roundLabel: string
  roundNumber: number
  isInternal: boolean
  status: InterviewStatus
  schedulingMode: SchedulingMode | null
  proposedSlots: string[]
  calendarLinkUsed: string | null
  scheduledAt: string | null
  interviewerEmail: string | null
  magicLinkToken: string | null
  humanScore: number | null
  feedbackText: string | null
  feedbackPdfUrl: string | null
  feedbackSummary: string | null
  feedbackStrengths: string[]
  feedbackConcerns: string[]
  aiScore: number | null
  feedbackParseMethod: string | null
  durationMinutes: number | null
  decision: InterviewDecision | null
  decisionNotes: string | null
  decidedAt: string | null
  decidedBy: { name: string | null; email: string } | null
  skillRatings: { skillName: string; rating: number; comment: string | null }[]
  createdAt: string
}

interface UserProfile {
  calendarLink: string | null
  timezone: string | null
  schedulingEmailTemplate: string | null
  rejectionEmailTemplate: string | null
  name: string | null
  email: string
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

const INTERVIEW_TYPE_LABELS: Partial<Record<PipelineStage, string>> = {
  SCREENING: 'Screening Interview',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer Discussion',
}

const INTERVIEW_STAGES: PipelineStage[] = [
  'SCREENING',
  'TECHNICAL_INTERVIEW',
  'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW',
  'OFFER',
]

// Stages that get an email preview when added
const EMAIL_PREVIEW_STAGES: PipelineStage[] = [
  'SCREENING',
  'TECHNICAL_INTERVIEW',
  'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW',
  'OFFER',
]

const STATUS_COLORS: Record<InterviewStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  AWAITING_SCHEDULE: 'bg-amber-100 text-amber-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<InterviewStatus, string> = {
  PENDING: 'Pending',
  AWAITING_SCHEDULE: 'Awaiting Schedule',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

const DECISION_COLORS: Record<InterviewDecision, string> = {
  ADVANCE: 'bg-green-100 text-green-700',
  REJECT: 'bg-red-100 text-red-700',
  HOLD: 'bg-yellow-100 text-yellow-700',
}

// ─── helpers ───────────────────────────────────────────────────────────────

function selectClass() {
  return 'mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]'
}

function buildSchedulingEmailContent(
  interview: Interview,
  userProfile: UserProfile | null,
  positionTitle: string,
  clientName: string,
  candidateName: string,
) {
  const recruiterName = userProfile?.name ?? userProfile?.email ?? 'Recruiter'
  const isScreening = interview.stage === 'SCREENING'

  const tokens = buildSchedulingTokens({
    candidateName,
    positionTitle,
    clientName,
    recruiterName,
    roundLabel: interview.roundLabel,
    slots: interview.proposedSlots,
    calendarLink: interview.calendarLinkUsed,
    durationMinutes: interview.durationMinutes,
  })

  const template = isScreening
    ? (userProfile?.schedulingEmailTemplate ?? DEFAULT_SCHEDULING_TEMPLATE)
    : DEFAULT_NEXT_ROUND_TEMPLATE

  const interviewTypeLabel = INTERVIEW_TYPE_LABELS[interview.stage as PipelineStage] ?? 'Interview'
  const subject = `${interviewTypeLabel} - ${positionTitle} - ${candidateName}`
  const html = renderTemplate(template, tokens)
  return { subject, html }
}

function buildRejectionEmailContent(
  interview: Interview,
  userProfile: UserProfile | null,
  positionTitle: string,
  clientName: string,
  candidateName: string,
) {
  const recruiterName = userProfile?.name ?? userProfile?.email ?? 'Recruiter'
  const tokens: Record<string, string> = {
    candidateName,
    positionTitle,
    clientName,
    recruiterName,
    roundLabel: interview.roundLabel,
    schedulingLink: '',
    slotsList: '',
    nextRoundLabel: '',
  }
  const template = userProfile?.rejectionEmailTemplate ?? DEFAULT_REJECTION_TEMPLATE
  const subject = `Update on your application - ${positionTitle} - ${candidateName}`
  const html = renderTemplate(template, tokens)
  return { subject, html }
}

// ─── SlotList ──────────────────────────────────────────────────────────────

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4)
  const m = (i % 4) * 15
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mm} ${h < 12 ? 'AM' : 'PM'}`
  return { value: `${hh}:${mm}`, label }
})

function SlotEntry({ value, onChange, onRemove, showRemove, timezone }: { value: string; onChange: (v: string) => void; onRemove: () => void; showRemove: boolean; timezone: string }) {
  const [date, time] = value ? value.split('T') : ['', '00:00']
  function set(d: string, t: string) { onChange(d && t ? `${d}T${t}` : '') }
  return (
    <div className="flex items-center gap-2">
      <Input type="date" value={date} onChange={(e) => set(e.target.value, time)} className="flex-1" required />
      <select value={time} onChange={(e) => set(date, e.target.value)} className="border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000] bg-white border-gray-200">
        {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {showRemove && (
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      )}
    </div>
  )
}

function SlotList({ slots, onChange, timezone }: { slots: string[]; onChange: (slots: string[]) => void; timezone: string }) {
  function update(i: number, val: string) { const n = [...slots]; n[i] = val; onChange(n) }
  function remove(i: number) { onChange(slots.filter((_, idx) => idx !== i)) }
  return (
    <div className="space-y-2">
      {slots.map((slot, i) => (
        <SlotEntry key={i} value={slot} onChange={(v) => update(i, v)} onRemove={() => remove(i)} showRemove={slots.length > 1} timezone={timezone} />
      ))}
      <button type="button" onClick={() => onChange([...slots, ''])} className="text-sm text-blue-600 hover:underline">
        + Add another slot
      </button>
    </div>
  )
}

// ─── ConfirmedDatePicker ───────────────────────────────────────────────────

function ConfirmedDatePicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const parts = value ? value.split('T') : ['', '09:00']
  const date = parts[0]
  const time = (parts[1] ?? '09:00').slice(0, 5)
  function set(d: string, t: string) { onChange(d && t ? `${d}T${t}` : '') }
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={date}
        onChange={(e) => set(e.target.value, time)}
        disabled={disabled}
        className="flex-1"
      />
      <select
        value={time}
        onChange={(e) => set(date, e.target.value)}
        disabled={disabled}
        className={`border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000] bg-white border-gray-200 ${disabled ? 'bg-gray-50 text-gray-400' : ''}`}
      >
        {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass()}>
      {RECRUITER_TIMEZONES.map((tz) => (
        <option key={tz.value} value={tz.value}>{tz.label}</option>
      ))}
    </select>
  )
}

// ─── FeedbackPdfUpload ─────────────────────────────────────────────────────

function FeedbackPdfUpload({
  interviewId,
  existingPdfUrl,
  onParsed,
}: {
  interviewId: string
  existingPdfUrl: string | null
  onParsed: (interview: Interview) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function upload(file: File) {
    if (file.type !== 'application/pdf') { setError('Only PDF files are accepted'); return }
    if (file.size > 10 * 1024 * 1024) { setError('File exceeds 10MB limit'); return }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/interviews/${interviewId}/upload-feedback`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return }
      onParsed(data as Interview)
    } catch {
      setError('Network error')
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) upload(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Feedback PDF</Label>
        {existingPdfUrl && (
          <a
            href={`https://drive.google.com/file/d/${existingPdfUrl}/view`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            View current PDF ↗
          </a>
        )}
      </div>

      <label
        className={`relative flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 cursor-pointer transition-colors ${dragOver ? 'border-[#8DF000] bg-lime-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'} ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input type="file" accept="application/pdf" className="sr-only" onChange={onFileInput} disabled={uploading} />
        {uploading ? (
          <p className="text-sm text-gray-500">Parsing feedback PDF…</p>
        ) : (
          <>
            <p className="text-sm text-gray-600 font-medium">{existingPdfUrl ? 'Drop to replace feedback PDF' : 'Drop feedback PDF here or click to upload'}</p>
            <p className="text-xs text-gray-400">PDF only · max 10 MB</p>
          </>
        )}
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

// ─── FeedbackParseResult ────────────────────────────────────────────────────

function aiScoreColor(score: number): string {
  if (score >= 4) return 'text-green-700'
  if (score === 3) return 'text-yellow-700'
  return 'text-red-700'
}

function FeedbackParseResult({
  summary,
  strengths,
  concerns,
  aiScore,
  feedbackParseMethod,
}: {
  summary: string
  strengths: string[]
  concerns: string[]
  aiScore: number | null
  feedbackParseMethod?: string | null
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 text-sm">
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">AI Summary</p>
        <p className="text-gray-700">{summary}</p>
      </div>
      {strengths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Strengths</p>
          <ul className="space-y-0.5">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-green-700">
                <span className="mt-0.5 shrink-0">✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {concerns.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Concerns</p>
          <ul className="space-y-0.5">
            {concerns.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-orange-700">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No concerns noted</p>
      )}
      {aiScore != null && (
        <div className="pt-1 border-t border-gray-200 flex items-center gap-2">
          <span className="text-xs text-gray-500">🤖 AI Score:</span>
          <span className={`font-semibold text-sm ${aiScoreColor(aiScore)}`}>{aiScore}/5</span>
          <span className="text-gray-300">{'★'.repeat(aiScore)}{'☆'.repeat(5 - aiScore)}</span>
        </div>
      )}
      {feedbackParseMethod && (
        <p className="text-xs text-gray-400 pt-1">
          {feedbackParseMethod === 'vision' ? 'Parsed from document images' : 'Parsed from document text'}
        </p>
      )}
    </div>
  )
}

// ─── GenericEmailPreviewModal ───────────────────────────────────────────────

function GenericEmailPreviewModal({
  title,
  candidateName,
  candidateEmail,
  defaultSubject,
  defaultHtml,
  sendEndpoint,
  onSend,
  onSkip,
  onCancel,
}: {
  title: string
  candidateName: string
  candidateEmail: string
  defaultSubject: string
  defaultHtml: string
  sendEndpoint: string
  onSend: (data: unknown) => void
  onSkip: () => void
  onCancel: () => void
}) {
  const [subject, setSubject] = useState(
    defaultSubject.replace('{{candidateName}}', candidateName)
  )
  const [html, setHtml] = useState(
    defaultHtml.replace(/\{\{candidateName\}\}/g, candidateName)
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(sendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Send failed'); return }
      onSend(data)
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">
            To: <span className="font-medium text-gray-700">{candidateName}</span>{' '}
            <span className="text-gray-400">{'<'}{candidateEmail}{'>'}</span>
          </p>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto">
          <div>
            <Label htmlFor="emailSubject">Subject</Label>
            <Input id="emailSubject" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="emailBody">Body (HTML)</Label>
            <textarea
              id="emailBody"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={10}
              className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
            />
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Preview</p>
            <div className="text-sm text-gray-800 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 mt-3">
            {error}
            {error.toLowerCase().includes('gmail') && (
              <> — <Link href="/profile" className="underline font-medium hover:text-red-800">Go to Profile to connect</Link></>
            )}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="outline" onClick={onSkip}>Skip for now</Button>
          <Button type="button" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send Email'}</Button>
        </div>
      </div>
    </div>
  )
}

// ─── NextRoundModal ─────────────────────────────────────────────────────────

function NextRoundModal({
  candidatePositionId,
  fromStage,
  userProfile,
  candidateName,
  candidateEmail,
  positionTitle,
  clientName,
  onCreated,
  onSkip,
}: {
  candidatePositionId: string
  fromStage: PipelineStage
  userProfile: UserProfile | null
  candidateName: string
  candidateEmail: string
  positionTitle: string
  clientName: string
  onCreated: (interview: Interview) => void
  onSkip: () => void
}) {
  const defaultNext = getNextStage(fromStage as Parameters<typeof getNextStage>[0]) ?? 'TECHNICAL_INTERVIEW'
  const [selectedStage, setSelectedStage] = useState<PipelineStage>(defaultNext as PipelineStage)
  const [phase, setPhase] = useState<'select' | 'schedule' | 'preview'>('select')
  const [slots, setSlots] = useState<string[]>([''])
  const [schedulingMode, setSchedulingMode] = useState<SchedulingMode>('MANUAL_SLOTS')
  const [slotTimezone, setSlotTimezone] = useState(userProfile?.timezone ?? 'America/Montevideo')
  const [duration, setDuration] = useState<number>(60)
  const [creating, setCreating] = useState(false)
  const [createdInterview, setCreatedInterview] = useState<Interview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isScreening = selectedStage === 'SCREENING'
  const hasCalendarLink = !!userProfile?.calendarLink

  const nextStageOptions = STAGE_SEQUENCE.filter(
    (s) => s !== 'APPLIED' && s !== 'HIRED'
  ) as PipelineStage[]

  async function createInterview() {
    setCreating(true)
    setError(null)
    const isCalendar = isScreening && schedulingMode === 'CALENDAR_LINK'
    if (!isCalendar) {
    }
    try {
      const res = await fetch(`/api/candidate-positions/${candidatePositionId}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: selectedStage,
          schedulingMode: isCalendar ? 'CALENDAR_LINK' : 'MANUAL_SLOTS',
          proposedSlots: isCalendar ? [] : slots.filter(Boolean).map((s) => zonedToUtcIso(s, slotTimezone)),
          calendarLinkUsed: isCalendar ? userProfile?.calendarLink : null,
          durationMinutes: duration || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to create interview')
        return
      }
      const interview: Interview = await res.json()
      setCreatedInterview(interview)
      setPhase('preview')
    } catch {
      setError('Network error')
    } finally {
      setCreating(false)
    }
  }

  if (phase === 'preview' && createdInterview) {
    const { subject: defaultSubject, html: defaultHtml } = buildSchedulingEmailContent(
      createdInterview, userProfile, positionTitle, clientName, candidateName
    )
    return (
      <GenericEmailPreviewModal
        title="Schedule Next Round"
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        defaultSubject={defaultSubject}
        defaultHtml={defaultHtml}
        sendEndpoint={`/api/interviews/${createdInterview.id}/send-scheduling-email`}
        onSend={(updated) => onCreated(updated as Interview)}
        onSkip={() => onCreated(createdInterview)}
        onCancel={() => onCreated(createdInterview)}
      />
    )
  }

  if (phase === 'schedule') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Schedule Next Round</h2>
            <p className="text-sm text-gray-500">{STAGE_LABELS[selectedStage]} for {candidateName}</p>
          </div>

          {isScreening && (
            <div className="flex gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={schedulingMode === 'MANUAL_SLOTS'} onChange={() => setSchedulingMode('MANUAL_SLOTS')} className="accent-[#8DF000]" />
                <span className="text-sm text-gray-700">Add time slots manually</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={schedulingMode === 'CALENDAR_LINK'} onChange={() => setSchedulingMode('CALENDAR_LINK')} className="accent-[#8DF000]" />
                <span className="text-sm text-gray-700">Use my Calendar Link</span>
              </label>
            </div>
          )}

          {isScreening && schedulingMode === 'CALENDAR_LINK' ? (
            hasCalendarLink ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
                <p className="font-medium break-all">{userProfile!.calendarLink}</p>
                <p className="text-xs text-blue-500 mt-0.5">Candidate will receive this link.</p>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-700">
                No calendar link set.{' '}
                <a href="/profile" className="underline font-medium" target="_blank" rel="noreferrer">Set one in your Profile</a>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Your Timezone (slots are in this timezone)</Label>
                <div className="mt-1"><TimezoneSelect value={slotTimezone} onChange={setSlotTimezone} /></div>
              </div>
              <div>
                <Label>Proposed Time Slots</Label>
                <div className="mt-1"><SlotList slots={slots} onChange={setSlots} timezone={slotTimezone} /></div>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="nr-duration">Duration (minutes)</Label>
            <Input id="nr-duration" type="number" min={15} max={480} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mt-1 w-32" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPhase('select')}>← Back</Button>
            <Button type="button" onClick={createInterview} disabled={creating}>
              {creating ? 'Creating…' : 'Next: Preview Email →'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Phase: select
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Create Next Interview Round</h2>
          <p className="text-sm text-gray-500">Great! Let&apos;s schedule the next step for {candidateName}.</p>
        </div>

        <div>
          <Label htmlFor="nextStage">Next Stage</Label>
          <select
            id="nextStage"
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value as PipelineStage)}
            className={selectClass()}
          >
            {nextStageOptions.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onSkip}>I&apos;ll do this later</Button>
          <Button type="button" onClick={() => setPhase('schedule')}>Create &amp; Schedule Now</Button>
        </div>
      </div>
    </div>
  )
}

// ─── AddInterviewModal ──────────────────────────────────────────────────────

function AddInterviewModal({
  candidatePositionId,
  userProfile,
  candidateName,
  candidateEmail,
  positionTitle,
  clientName,
  initialStage,
  onClose,
  onSaved,
}: {
  candidatePositionId: string
  userProfile: UserProfile | null
  candidateName: string
  candidateEmail: string
  positionTitle: string
  clientName: string
  initialStage?: PipelineStage
  onClose: () => void
  onSaved: (interview: Interview) => void
}) {
  const [stage, setStage] = useState<PipelineStage>(initialStage ?? 'SCREENING')
  const [schedulingMode, setSchedulingMode] = useState<SchedulingMode>('MANUAL_SLOTS')
  const [slots, setSlots] = useState<string[]>([''])
  const [slotTimezone, setSlotTimezone] = useState(userProfile?.timezone ?? 'America/Montevideo')
  const [duration, setDuration] = useState<number>(stage === 'SCREENING' || stage === 'MANAGER_INTERVIEW' ? 30 : 60)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingInterview, setPendingInterview] = useState<Interview | null>(null)

  const isScreening = stage === 'SCREENING'
  const hasCalendarLink = !!userProfile?.calendarLink
  const showEmailPreview = EMAIL_PREVIEW_STAGES.includes(stage)

  useEffect(() => {
    if (!isScreening) setSchedulingMode('MANUAL_SLOTS')
  }, [isScreening])

  useEffect(() => {
    setDuration(stage === 'SCREENING' || stage === 'MANAGER_INTERVIEW' ? 30 : 60)
  }, [stage])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const isCalendar = isScreening && schedulingMode === 'CALENDAR_LINK'
    if (!isCalendar) {
    }
    try {
      const res = await fetch(`/api/candidate-positions/${candidatePositionId}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          schedulingMode: isCalendar ? 'CALENDAR_LINK' : 'MANUAL_SLOTS',
          proposedSlots: isCalendar ? [] : slots.filter(Boolean).map((s) => zonedToUtcIso(s, slotTimezone)),
          calendarLinkUsed: isCalendar ? userProfile?.calendarLink : null,
          durationMinutes: duration || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to create interview')
        return
      }
      const interview: Interview = await res.json()
      if (showEmailPreview) {
        setPendingInterview(interview)
      } else {
        onSaved(interview)
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (pendingInterview) {
    const { subject, html } = buildSchedulingEmailContent(pendingInterview, userProfile, positionTitle, clientName, candidateName)
    return (
      <GenericEmailPreviewModal
        title="Email Preview"
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        defaultSubject={subject}
        defaultHtml={html}
        sendEndpoint={`/api/interviews/${pendingInterview.id}/send-scheduling-email`}
        onSend={(updated) => onSaved(updated as Interview)}
        onSkip={() => onSaved(pendingInterview)}
        onCancel={() => onSaved(pendingInterview)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Interview Round</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="stage">Pipeline Stage</Label>
            <select id="stage" value={stage} onChange={(e) => setStage(e.target.value as PipelineStage)} className={selectClass()}>
              {INTERVIEW_STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <Label>Scheduling</Label>
            {isScreening && (
              <div className="flex gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="schedulingMode" value="MANUAL_SLOTS" checked={schedulingMode === 'MANUAL_SLOTS'} onChange={() => setSchedulingMode('MANUAL_SLOTS')} className="accent-[#8DF000]" />
                  <span className="text-sm text-gray-700">Add time slots manually</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="schedulingMode" value="CALENDAR_LINK" checked={schedulingMode === 'CALENDAR_LINK'} onChange={() => setSchedulingMode('CALENDAR_LINK')} className="accent-[#8DF000]" />
                  <span className="text-sm text-gray-700">Use my Calendar Link</span>
                </label>
              </div>
            )}
            {isScreening && schedulingMode === 'CALENDAR_LINK' ? (
              hasCalendarLink ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
                  <p className="font-medium truncate">{userProfile!.calendarLink}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Candidate will receive this link.</p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-700">
                  You haven&apos;t set a calendar booking link yet.{' '}
                  <a href="/profile" className="underline font-medium" target="_blank" rel="noreferrer">Set one in your Profile</a>
                  , or choose manual slots above.
                </div>
              )
            ) : (
              <div className="space-y-2">
                <div>
                  <Label>Your Timezone (slots are in this timezone)</Label>
                  <div className="mt-1"><TimezoneSelect value={slotTimezone} onChange={setSlotTimezone} /></div>
                </div>
                <SlotList slots={slots} onChange={setSlots} timezone={slotTimezone} />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="add-duration">Duration (minutes)</Label>
            <Input id="add-duration" type="number" min={15} max={480} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mt-1 w-32" />
          </div>

          {showEmailPreview && (
            <p className="text-xs text-gray-400">
              After adding, you&apos;ll be able to preview and send a scheduling email to the candidate.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || (isScreening && schedulingMode === 'CALENDAR_LINK' && !hasCalendarLink)}>
              {saving ? 'Saving…' : showEmailPreview ? 'Next: Preview Email →' : 'Add Interview'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── EditInterviewModal ──────────────────────────────────────────────────────

function EditInterviewModal({
  interview,
  userProfile,
  candidateName,
  candidateEmail,
  candidatePositionId,
  positionTitle,
  clientName,
  positionTimezone = 'America/Montevideo',
  onClose,
  onSaved,
  onInterviewCreated,
}: {
  interview: Interview
  userProfile: UserProfile | null
  candidateName: string
  candidateEmail: string
  candidatePositionId: string
  positionTitle: string
  clientName: string
  positionTimezone?: string
  onClose: () => void
  onSaved: (interview: Interview) => void
  onInterviewCreated: (interview: Interview) => void
}) {
  const [currentInterview, setCurrentInterview] = useState(interview)
  const [scheduledAt, setScheduledAt] = useState(() => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const toLocalDatetimeStr = (iso: string) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    if (interview.scheduledAt) return toLocalDatetimeStr(interview.scheduledAt)
    // Pre-populate from first proposed slot when no confirmed date is set
    if (interview.proposedSlots.length > 0) return toLocalDatetimeStr(interview.proposedSlots[0])
    return ''
  })
  const [feedbackText, setFeedbackText] = useState(interview.feedbackText ?? '')
  const [durationMinutes, setDurationMinutes] = useState<number>(interview.durationMinutes ?? (interview.stage === 'SCREENING' || interview.stage === 'MANAGER_INTERVIEW' ? 30 : 60))
  const [panelType, setPanelType] = useState<'INTERNAL' | 'EXTERNAL'>(interview.isInternal ? 'INTERNAL' : 'EXTERNAL')
  const [interviewerEmail, setInterviewerEmail] = useState(interview.interviewerEmail ?? '')
  const [confirmationError, setConfirmationError] = useState<{ interviewerEmail?: string } | null>(null)
  const [decision, setDecision] = useState<InterviewDecision | ''>(interview.decision ?? '')
  const [decisionNotes, setDecisionNotes] = useState(interview.decisionNotes ?? '')
  const needsConfirmationFields = interview.stage === 'TECHNICAL_INTERVIEW' || interview.stage === 'MANAGER_INTERVIEW'
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [postSaveFlow, setPostSaveFlow] = useState<'rejection-email' | 'next-round' | null>(null)
  const [parsing, setParsing] = useState(false)
  const [previewResult, setPreviewResult] = useState<{ summary: string; strengths: string[]; concerns: string[]; score: number } | null>(null)
  const [parsedText, setParsedText] = useState<string | null>(null)

  async function patch(body: Record<string, unknown>): Promise<Interview | null> {
    const res = await fetch(`/api/interviews/${currentInterview.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to update')
      return null
    }
    return res.json()
  }

  async function parseManual() {
    if (!feedbackText.trim()) return
    setParsing(true)
    setError(null)
    try {
      const res = await fetch('/api/interviews/parse-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: feedbackText }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Parse failed'); return }
      setPreviewResult(data)
      setParsedText(feedbackText)
    } catch {
      setError('Parse failed — please try again')
    } finally {
      setParsing(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setConfirmationError(null)

    // Validate Panel Type / Interviewer Email when setting a confirmed date for tech/manager rounds
    if (scheduledAt && needsConfirmationFields && panelType === 'INTERNAL') {
      const emailVal = interviewerEmail.trim()
      if (!emailVal || !emailVal.includes('@')) {
        setConfirmationError({ interviewerEmail: 'A valid interviewer email is required for internal panels.' })
        setSaving(false)
        return
      }
    }

    const alreadyParsed = previewResult && parsedText === feedbackText && feedbackText.trim().length > 0
    const updated = await patch({
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      feedbackText: feedbackText || null,
      durationMinutes: durationMinutes || null,
      isInternal: panelType === 'INTERNAL',
      interviewerEmail: needsConfirmationFields && panelType === 'INTERNAL' ? interviewerEmail.trim() || null : null,
      decision: decision || null,
      decisionNotes: decisionNotes || null,
      ...(alreadyParsed ? {
        _parsedFromClient: true,
        feedbackSummary: previewResult.summary,
        feedbackStrengths: previewResult.strengths,
        feedbackConcerns: previewResult.concerns,
        aiScore: previewResult.score,
      } : {}),
    })
    setSaving(false)
    if (!updated) return

    setCurrentInterview(updated)

    // Show feedback request confirmation when magic link was just generated
    const magicLinkJustSent =
      updated.magicLinkToken &&
      !interview.magicLinkToken &&
      updated.interviewerEmail

    if (magicLinkJustSent) {
      setSuccessMsg(`Interview scheduled. A feedback request has been sent to ${updated.interviewerEmail}.`)
    }

    const decisionChanged = updated.decision !== interview.decision
    if (decisionChanged && updated.decision === 'REJECT') {
      setPostSaveFlow('rejection-email')
    } else if (decisionChanged && updated.decision === 'ADVANCE') {
      setPostSaveFlow('next-round')
    } else if (!magicLinkJustSent) {
      onSaved(updated)
    }
  }

  async function cancelInterview() {
    if (!confirm('Cancel this interview? This cannot be undone.')) return
    setCancelling(true)
    setError(null)
    const updated = await patch({ action: 'cancel' })
    setCancelling(false)
    if (updated) onSaved(updated)
  }

  const [showSchedulingEmailPreview, setShowSchedulingEmailPreview] = useState(false)

  const canSendSchedulingEmail =
    currentInterview.stage === 'SCREENING' &&
    (currentInterview.status === 'PENDING' || currentInterview.status === 'AWAITING_SCHEDULE')
  const isCancelled = currentInterview.status === 'CANCELLED'
  const canShowFeedback = currentInterview.status === 'SCHEDULED' || currentInterview.status === 'COMPLETED'

  // Rejection email preview
  if (postSaveFlow === 'rejection-email') {
    const { subject, html } = buildRejectionEmailContent(currentInterview, userProfile, positionTitle, clientName, candidateName)
    return (
      <GenericEmailPreviewModal
        title="Rejection Email Preview"
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        defaultSubject={subject}
        defaultHtml={html}
        sendEndpoint={`/api/interviews/${currentInterview.id}/send-rejection-email`}
        onSend={() => onSaved(currentInterview)}
        onSkip={() => onSaved(currentInterview)}
        onCancel={() => onSaved(currentInterview)}
      />
    )
  }

  // Next round modal
  if (postSaveFlow === 'next-round') {
    return (
      <NextRoundModal
        candidatePositionId={candidatePositionId}
        fromStage={currentInterview.stage}
        userProfile={userProfile}
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        positionTitle={positionTitle}
        clientName={clientName}
        onCreated={(newInterview) => {
          onInterviewCreated(newInterview)
          onSaved(currentInterview)
        }}
        onSkip={() => onSaved(currentInterview)}
      />
    )
  }

  if (showSchedulingEmailPreview) {
    const { subject, html } = buildSchedulingEmailContent(currentInterview, userProfile, positionTitle, clientName, candidateName)
    return (
      <GenericEmailPreviewModal
        title="Email Preview"
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        defaultSubject={subject}
        defaultHtml={html}
        sendEndpoint={`/api/interviews/${currentInterview.id}/send-scheduling-email`}
        onSend={(updated) => { setCurrentInterview(updated as Interview); setShowSchedulingEmailPreview(false) }}
        onSkip={() => setShowSchedulingEmailPreview(false)}
        onCancel={() => setShowSchedulingEmailPreview(false)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Edit Interview</h2>
        <p className="text-sm text-gray-500 mb-4">{currentInterview.roundLabel} · {STAGE_LABELS[currentInterview.stage]}</p>

        <div className="flex items-center gap-3 mb-4">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[currentInterview.status]}`}>
            {STATUS_LABELS[currentInterview.status]}
          </span>
          {!isCancelled && (
            <Button type="button" variant="outline" size="sm" onClick={cancelInterview} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel Interview'}
            </Button>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {currentInterview.calendarLinkUsed ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
              Calendar link: <span className="font-medium break-all">{currentInterview.calendarLinkUsed}</span>
            </div>
          ) : currentInterview.proposedSlots.length > 0 ? (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600 space-y-1.5">
              <p className="font-medium text-gray-700 text-xs">Proposed slots — click to set confirmed date:</p>
              <div className="flex flex-wrap gap-1.5">
                {currentInterview.proposedSlots.map((s) => {
                  const d = new Date(s)
                  const pad = (n: number) => String(n).padStart(2, '0')
                  const localVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
                  const label = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScheduledAt(localVal)}
                      className="px-2.5 py-1 rounded-full border border-gray-300 bg-white text-xs text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors cursor-pointer"
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {currentInterview.status === 'COMPLETED' ? (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm text-gray-600 space-y-0.5">
              {currentInterview.scheduledAt && (
                <p><span className="font-medium text-gray-700">Date: </span>{new Date(currentInterview.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: positionTimezone, timeZoneName: 'short' })}</p>
              )}
              {currentInterview.durationMinutes && (
                <p><span className="font-medium text-gray-700">Duration: </span>{currentInterview.durationMinutes} min</p>
              )}
            </div>
          ) : (
            <div className="space-y-3 border border-gray-100 rounded-xl p-4">
              <div>
                <Label>Confirmed Date</Label>
                <p className="text-xs text-gray-400 mb-1">Setting a date will mark this interview as Scheduled.</p>
                <ConfirmedDatePicker value={scheduledAt} onChange={setScheduledAt} disabled={isCancelled} />
              </div>
              <div>
                <Label htmlFor="edit-duration">Duration (minutes)</Label>
                <Input id="edit-duration" type="number" min={15} max={480} step={15} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} disabled={isCancelled} className="mt-1 w-32" />
              </div>

              {needsConfirmationFields && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div>
                    <Label>Panel Type <span className="text-red-500">*</span></Label>
                    <div className="flex gap-4 mt-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="panelType" value="INTERNAL" checked={panelType === 'INTERNAL'} onChange={() => setPanelType('INTERNAL')} className="accent-[#8DF000]" disabled={isCancelled} />
                        <span className="text-sm text-gray-700">Internal Panel</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="panelType" value="EXTERNAL" checked={panelType === 'EXTERNAL'} onChange={() => { setPanelType('EXTERNAL'); setInterviewerEmail(''); setConfirmationError(null) }} className="accent-[#8DF000]" disabled={isCancelled} />
                        <span className="text-sm text-gray-700">External Panel</span>
                      </label>
                    </div>
                  </div>
                  {panelType === 'INTERNAL' && (
                    <div>
                      <Label htmlFor="edit-interviewerEmail">Interviewer Email <span className="text-red-500">*</span></Label>
                      <p className="text-xs text-gray-400 mb-1">They&apos;ll receive a magic link to submit structured feedback when the date is confirmed.</p>
                      <Input
                        id="edit-interviewerEmail"
                        type="email"
                        value={interviewerEmail}
                        onChange={(e) => { setInterviewerEmail(e.target.value); if (confirmationError) setConfirmationError(null) }}
                        placeholder="interviewer@company.com"
                        disabled={isCancelled}
                        className={`mt-0.5 ${confirmationError?.interviewerEmail ? 'border-red-400' : ''}`}
                      />
                      {confirmationError?.interviewerEmail && (
                        <p className="text-xs text-red-600 mt-1">{confirmationError.interviewerEmail}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {currentInterview.humanScore != null && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-2">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Interviewer Feedback</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-blue-900">Score: {currentInterview.humanScore}/5</span>
                <span className="text-yellow-500">{'★'.repeat(currentInterview.humanScore)}{'☆'.repeat(5 - currentInterview.humanScore)}</span>
              </div>
              {currentInterview.feedbackParseMethod === 'interviewer_form' && currentInterview.feedbackSummary && (
                <p className="text-sm text-blue-800">{currentInterview.feedbackSummary}</p>
              )}
              {currentInterview.skillRatings.length > 0 && (
                <div className="pt-2 border-t border-blue-200 space-y-1.5">
                  <p className="text-xs font-medium text-blue-600">Skill Ratings</p>
                  {currentInterview.skillRatings.map((sr) => (
                    <div key={sr.skillName} className="flex items-start gap-2 text-sm">
                      <span className="font-medium text-blue-900 w-32 shrink-0">{sr.skillName}</span>
                      <span className="text-yellow-500">{'★'.repeat(sr.rating)}{'☆'.repeat(5 - sr.rating)}</span>
                      {sr.comment && <span className="text-blue-700 text-xs">{sr.comment}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isCancelled && canShowFeedback && (
            <FeedbackPdfUpload
              interviewId={currentInterview.id}
              existingPdfUrl={currentInterview.feedbackPdfUrl}
              onParsed={(updated) => {
                setCurrentInterview(updated)
                setFeedbackText(updated.feedbackText ?? '')
              }}
            />
          )}

          {canShowFeedback && (currentInterview.feedbackSummary || previewResult) && currentInterview.feedbackParseMethod !== 'interviewer_form' && (
            <FeedbackParseResult
              summary={previewResult?.summary ?? currentInterview.feedbackSummary ?? ''}
              strengths={previewResult?.strengths ?? currentInterview.feedbackStrengths}
              concerns={previewResult?.concerns ?? currentInterview.feedbackConcerns}
              aiScore={previewResult?.score ?? currentInterview.aiScore ?? null}
              feedbackParseMethod={previewResult ? 'text' : currentInterview.feedbackParseMethod}
            />
          )}

          {canShowFeedback && currentInterview.feedbackPdfUrl && (
            <a
              href={`https://drive.google.com/file/d/${currentInterview.feedbackPdfUrl}/view`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              View Feedback PDF ↗
            </a>
          )}

          {canShowFeedback && (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <Label htmlFor="feedbackText">Feedback Notes</Label>
                {feedbackText.trim() && !isCancelled && (
                  <button
                    type="button"
                    onClick={parseManual}
                    disabled={parsing}
                    className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                  >
                    {parsing ? 'Parsing…' : '🤖 Parse'}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-1">Adding feedback will mark this interview as Completed. Upload a PDF above to auto-fill.</p>
              <textarea
                id="feedbackText"
                value={feedbackText}
                onChange={(e) => { setFeedbackText(e.target.value); if (previewResult) setPreviewResult(null) }}
                rows={4}
                disabled={isCancelled}
                className="mt-0.5 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000] disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="Interviewer notes…"
              />
            </div>
          )}

          {canShowFeedback && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="decision">Decision</Label>
                <select id="decision" value={decision} onChange={(e) => setDecision(e.target.value as InterviewDecision | '')} disabled={isCancelled} className={`${selectClass()} disabled:bg-gray-50 disabled:text-gray-400`}>
                  <option value="">— No decision yet —</option>
                  <option value="ADVANCE">Advance</option>
                  <option value="HOLD">Hold</option>
                  <option value="REJECT">Reject</option>
                </select>
              </div>
              <div>
                <Label htmlFor="decisionNotes">Decision Notes</Label>
                <Input id="decisionNotes" value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} placeholder="Optional notes" disabled={isCancelled} className="mt-1" />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

          <div className="flex items-center justify-between pt-2">
            {canSendSchedulingEmail ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSchedulingEmailPreview(true)}>
                Send Scheduling Email
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
              {!isCancelled && (
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── InterviewsSection ───────────────────────────────────────────────────────

export function InterviewsSection({
  candidatePositionId,
  candidateName,
  candidateEmail,
  positionTitle,
  clientName,
  positionTimezone = 'America/Montevideo',
  initialOpenInterviewId,
}: {
  candidatePositionId: string
  candidateName: string
  candidateEmail: string
  positionTitle: string
  clientName: string
  positionTimezone?: string
  initialOpenInterviewId?: string
}) {
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Interview | null>(null)

  const load = useCallback(async () => {
    try {
      const [intRes, profileRes] = await Promise.all([
        fetch(`/api/candidate-positions/${candidatePositionId}/interviews`),
        fetch('/api/profile'),
      ])
      if (intRes.ok) {
        const data: Interview[] = await intRes.json()
        setInterviews(data)
        if (initialOpenInterviewId) {
          const match = data.find((i) => i.id === initialOpenInterviewId)
          if (match) setEditing(match)
        }
      }
      if (profileRes.ok) setUserProfile(await profileRes.json())
    } finally {
      setLoading(false)
    }
  }, [candidatePositionId, initialOpenInterviewId])

  useEffect(() => { load() }, [load])

  function upsertInterview(interview: Interview) {
    setInterviews((prev) => {
      const exists = prev.find((i) => i.id === interview.id)
      return exists ? prev.map((i) => i.id === interview.id ? interview : i) : [...prev, interview]
    })
  }

  function formatSlot(iso: string) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-900">Interviews</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}>+ Add Round</Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : interviews.length === 0 ? (
        <p className="text-sm text-gray-400">No interview rounds yet.</p>
      ) : (
        <div className="space-y-3">
          {[...interviews].sort((a, b) => {
            const stageOrder: Record<string, number> = {
              APPLIED: 0, SCREENING: 1, TECHNICAL_INTERVIEW: 2, MANAGER_INTERVIEW: 3,
              CLIENT_INTERVIEW: 4, OFFER: 5, HIRED: 6,
            }
            const stageDiff = (stageOrder[b.stage] ?? 99) - (stageOrder[a.stage] ?? 99)
            if (stageDiff !== 0) return stageDiff
            return b.roundNumber - a.roundNumber
          }).map((interview) => (
            <div key={interview.id} className="border border-gray-100 rounded-lg p-4 cursor-pointer hover:bg-[#F5F0EB] transition-colors" onClick={() => setEditing(interview)}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-gray-900">{interview.roundLabel}</span>
                <span className="text-xs text-gray-500">{STAGE_LABELS[interview.stage]}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[interview.status]}`}>
                  {STATUS_LABELS[interview.status]}
                </span>
                {interview.decision && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_COLORS[interview.decision]}`}>
                    {interview.decision.charAt(0) + interview.decision.slice(1).toLowerCase()}
                  </span>
                )}
              </div>
              {interview.scheduledAt && (
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(interview.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: positionTimezone, timeZoneName: 'short' })}
                </p>
              )}
              {interview.interviewerEmail && (
                <p className="text-xs text-gray-500 mt-1">{interview.interviewerEmail}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddInterviewModal
          candidatePositionId={candidatePositionId}
          userProfile={userProfile}
          candidateName={candidateName}
          candidateEmail={candidateEmail}
          positionTitle={positionTitle}
          clientName={clientName}
          onClose={() => setShowAdd(false)}
          onSaved={(i) => { upsertInterview(i); setShowAdd(false) }}
        />
      )}
      {editing && (
        <EditInterviewModal
          interview={editing}
          userProfile={userProfile}
          candidateName={candidateName}
          candidateEmail={candidateEmail}
          candidatePositionId={candidatePositionId}
          positionTitle={positionTitle}
          clientName={clientName}
          positionTimezone={positionTimezone}
          onClose={() => setEditing(null)}
          onSaved={(i) => { upsertInterview(i); setEditing(null) }}
          onInterviewCreated={(i) => { upsertInterview(i) }}
        />
      )}
    </div>
  )
}
