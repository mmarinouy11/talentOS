'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_SCHEDULING_TEMPLATE,
  renderTemplate,
  buildSchedulingTokens,
} from '@/lib/email-templates'

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
  feedbackText: string | null
  feedbackSummary: string | null
  feedbackStrengths: string[]
  feedbackConcerns: string[]
  decision: InterviewDecision | null
  decisionNotes: string | null
  decidedAt: string | null
  decidedBy: { name: string | null; email: string } | null
  createdAt: string
}

interface UserProfile {
  calendarLink: string | null
  schedulingEmailTemplate: string | null
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

const INTERVIEW_STAGES: PipelineStage[] = [
  'SCREENING',
  'TECHNICAL_INTERVIEW',
  'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW',
  'OFFER',
]

const STATUS_COLORS: Record<InterviewStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  AWAITING_SCHEDULE: 'bg-blue-100 text-blue-700',
  SCHEDULED: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-100 text-gray-700',
  CANCELLED: 'bg-gray-100 text-gray-400',
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

function SlotList({ slots, onChange }: { slots: string[]; onChange: (slots: string[]) => void }) {
  function update(i: number, val: string) {
    const next = [...slots]; next[i] = val; onChange(next)
  }
  function remove(i: number) { onChange(slots.filter((_, idx) => idx !== i)) }
  return (
    <div className="space-y-2">
      {slots.map((slot, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input type="datetime-local" value={slot} onChange={(e) => update(i, e.target.value)} className="flex-1" required />
          {slots.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...slots, ''])} className="text-sm text-blue-600 hover:underline">
        + Add another slot
      </button>
    </div>
  )
}

function EmailPreviewModal({
  interview,
  userProfile,
  candidateName,
  candidateEmail,
  positionTitle,
  clientName,
  onSend,
  onSkip,
  onCancel,
}: {
  interview: Interview
  userProfile: UserProfile | null
  candidateName: string
  candidateEmail: string
  positionTitle: string
  clientName: string
  onSend: (updated: Interview) => void
  onSkip: () => void
  onCancel: () => void
}) {
  const recruiterName = userProfile?.name ?? userProfile?.email ?? 'Recruiter'
  const tokens = buildSchedulingTokens({
    candidateName,
    positionTitle,
    clientName,
    recruiterName,
    roundLabel: interview.roundLabel,
    slots: interview.proposedSlots,
    calendarLink: interview.calendarLinkUsed,
  })

  const template = userProfile?.schedulingEmailTemplate ?? DEFAULT_SCHEDULING_TEMPLATE
  const defaultSubject = `Interview Scheduling – ${positionTitle} at ${clientName}`
  const defaultHtml = renderTemplate(template, tokens)

  const [subject, setSubject] = useState(defaultSubject)
  const [html, setHtml] = useState(defaultHtml)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/interviews/${interview.id}/send-scheduling-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Send failed')
        return
      }
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
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email Preview</h2>
            <p className="text-sm text-gray-500">
              To: <span className="font-medium text-gray-700">{candidateName}</span>{' '}
              <span className="text-gray-400">{'<'}{candidateEmail}{'>'}</span>
            </p>
          </div>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto">
          <div>
            <Label htmlFor="emailSubject">Subject</Label>
            <Input
              id="emailSubject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex-1">
            <Label htmlFor="emailBody">Body (HTML)</Label>
            <textarea
              id="emailBody"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={12}
              className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Preview</p>
            <div
              className="text-sm text-gray-800 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="outline" onClick={onSkip}>Skip for now</Button>
          <Button type="button" onClick={send} disabled={sending}>
            {sending ? 'Sending…' : 'Send Email'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AddInterviewModal({
  candidatePositionId,
  userProfile,
  candidateName,
  candidateEmail,
  positionTitle,
  clientName,
  onClose,
  onSaved,
}: {
  candidatePositionId: string
  userProfile: UserProfile | null
  candidateName: string
  candidateEmail: string
  positionTitle: string
  clientName: string
  onClose: () => void
  onSaved: (interview: Interview) => void
}) {
  const [stage, setStage] = useState<PipelineStage>('SCREENING')
  const [schedulingMode, setSchedulingMode] = useState<SchedulingMode>('MANUAL_SLOTS')
  const [slots, setSlots] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingInterview, setPendingInterview] = useState<Interview | null>(null)

  const isScreening = stage === 'SCREENING'
  const hasCalendarLink = !!userProfile?.calendarLink

  useEffect(() => {
    if (!isScreening) setSchedulingMode('MANUAL_SLOTS')
  }, [isScreening])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const isCalendar = isScreening && schedulingMode === 'CALENDAR_LINK'
      const res = await fetch(`/api/candidate-positions/${candidatePositionId}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          schedulingMode: isCalendar ? 'CALENDAR_LINK' : 'MANUAL_SLOTS',
          proposedSlots: isCalendar ? [] : slots.filter(Boolean).map((s) => new Date(s).toISOString()),
          calendarLinkUsed: isCalendar ? userProfile?.calendarLink : null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to create interview')
        return
      }
      const interview: Interview = await res.json()
      if (isScreening) {
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
    return (
      <EmailPreviewModal
        interview={pendingInterview}
        userProfile={userProfile}
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        positionTitle={positionTitle}
        clientName={clientName}
        onSend={(updated) => onSaved(updated)}
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
            <select
              id="stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as PipelineStage)}
              className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
            >
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
              <SlotList slots={slots} onChange={setSlots} />
            )}
          </div>

          {isScreening && (
            <p className="text-xs text-gray-400">
              After adding, you&apos;ll be able to preview and send a scheduling email to the candidate.
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || (isScreening && schedulingMode === 'CALENDAR_LINK' && !hasCalendarLink)}>
              {saving ? 'Saving…' : isScreening ? 'Next: Preview Email →' : 'Add Interview'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditInterviewModal({
  interview,
  userProfile,
  candidateName,
  candidateEmail,
  positionTitle,
  clientName,
  onClose,
  onSaved,
}: {
  interview: Interview
  userProfile: UserProfile | null
  candidateName: string
  candidateEmail: string
  positionTitle: string
  clientName: string
  onClose: () => void
  onSaved: (interview: Interview) => void
}) {
  const [currentInterview, setCurrentInterview] = useState(interview)
  const [scheduledAt, setScheduledAt] = useState(
    interview.scheduledAt ? new Date(interview.scheduledAt).toISOString().slice(0, 16) : ''
  )
  const [feedbackText, setFeedbackText] = useState(interview.feedbackText ?? '')
  const [decision, setDecision] = useState<InterviewDecision | ''>(interview.decision ?? '')
  const [decisionNotes, setDecisionNotes] = useState(interview.decisionNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailPreview, setShowEmailPreview] = useState(false)

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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const updated = await patch({
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      feedbackText: feedbackText || null,
      decision: decision || null,
      decisionNotes: decisionNotes || null,
    })
    setSaving(false)
    if (updated) onSaved(updated)
  }

  async function cancel() {
    if (!confirm('Cancel this interview? This cannot be undone.')) return
    setCancelling(true)
    setError(null)
    const updated = await patch({ action: 'cancel' })
    setCancelling(false)
    if (updated) onSaved(updated)
  }

  const canSendSchedulingEmail =
    currentInterview.stage === 'SCREENING' &&
    (currentInterview.status === 'PENDING' || currentInterview.status === 'AWAITING_SCHEDULE')

  const isCancelled = currentInterview.status === 'CANCELLED'

  if (showEmailPreview) {
    return (
      <EmailPreviewModal
        interview={currentInterview}
        userProfile={userProfile}
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        positionTitle={positionTitle}
        clientName={clientName}
        onSend={(updated) => { setCurrentInterview(updated); onSaved(updated) }}
        onSkip={() => setShowEmailPreview(false)}
        onCancel={() => setShowEmailPreview(false)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        {/* Header */}
        <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Edit Interview</h2>
        <p className="text-sm text-gray-500 mb-4">{currentInterview.roundLabel} · {STAGE_LABELS[currentInterview.stage]}</p>

        {/* Status row */}
        <div className="flex items-center gap-3 mb-4">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[currentInterview.status]}`}>
            {STATUS_LABELS[currentInterview.status]}
          </span>
          {!isCancelled && (
            <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel Interview'}
            </Button>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Scheduling info (read-only) */}
          {currentInterview.calendarLinkUsed ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
              Calendar link: <span className="font-medium">{currentInterview.calendarLinkUsed}</span>
            </div>
          ) : currentInterview.proposedSlots.length > 0 ? (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
              <span className="font-medium text-gray-700">Proposed slots:</span>{' '}
              {currentInterview.proposedSlots
                .map((s) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))
                .join(' · ')}
            </div>
          ) : null}

          {/* Confirmed date → auto-transitions to SCHEDULED */}
          <div>
            <Label htmlFor="scheduledAt">Confirmed Date</Label>
            <p className="text-xs text-gray-400 mb-1">Setting a date will mark this interview as Scheduled.</p>
            <Input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-0.5"
              disabled={isCancelled}
            />
          </div>

          {/* Feedback → auto-transitions to COMPLETED */}
          <div>
            <Label htmlFor="feedbackText">Feedback Notes</Label>
            <p className="text-xs text-gray-400 mb-1">Adding feedback will mark this interview as Completed.</p>
            <textarea
              id="feedbackText"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={4}
              disabled={isCancelled}
              className="mt-0.5 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000] disabled:bg-gray-50 disabled:text-gray-400"
              placeholder="Interviewer notes…"
            />
          </div>

          {/* Decision */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="decision">Decision</Label>
              <select
                id="decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value as InterviewDecision | '')}
                disabled={isCancelled}
                className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000] disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">— No decision yet —</option>
                <option value="ADVANCE">Advance</option>
                <option value="HOLD">Hold</option>
                <option value="REJECT">Reject</option>
              </select>
            </div>
            <div>
              <Label htmlFor="decisionNotes">Decision Notes</Label>
              <Input
                id="decisionNotes"
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Optional notes"
                disabled={isCancelled}
                className="mt-1"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            {canSendSchedulingEmail ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowEmailPreview(true)}>
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

export function InterviewsSection({
  candidatePositionId,
  candidateName,
  candidateEmail,
  positionTitle,
  clientName,
}: {
  candidatePositionId: string
  candidateName: string
  candidateEmail: string
  positionTitle: string
  clientName: string
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
      if (intRes.ok) setInterviews(await intRes.json())
      if (profileRes.ok) setUserProfile(await profileRes.json())
    } finally {
      setLoading(false)
    }
  }, [candidatePositionId])

  useEffect(() => { load() }, [load])

  function handleAdded(interview: Interview) {
    setInterviews((prev) => {
      const existing = prev.find((i) => i.id === interview.id)
      return existing ? prev.map((i) => i.id === interview.id ? interview : i) : [...prev, interview]
    })
    setShowAdd(false)
  }

  function handleUpdated(interview: Interview) {
    setInterviews((prev) => prev.map((i) => (i.id === interview.id ? interview : i)))
    setEditing(null)
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
          {interviews.map((interview) => (
            <div key={interview.id} className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
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
                  {interview.calendarLinkUsed && (
                    <p className="text-xs text-blue-600 mt-1 truncate">Calendar link: {interview.calendarLinkUsed}</p>
                  )}
                  {interview.proposedSlots.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">Slots: {interview.proposedSlots.map(formatSlot).join(' · ')}</p>
                  )}
                  {interview.feedbackText && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{interview.feedbackText}</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(interview)}>Edit</Button>
              </div>
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
          onSaved={handleAdded}
        />
      )}
      {editing && (
        <EditInterviewModal
          interview={editing}
          userProfile={userProfile}
          candidateName={candidateName}
          candidateEmail={candidateEmail}
          positionTitle={positionTitle}
          clientName={clientName}
          onClose={() => setEditing(null)}
          onSaved={handleUpdated}
        />
      )}
    </div>
  )
}
