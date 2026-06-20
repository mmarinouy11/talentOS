'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type InterviewStatus = 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
type InterviewDecision = 'ADVANCE' | 'REJECT' | 'HOLD'
type PipelineStage = 'APPLIED' | 'SCREENING' | 'TECHNICAL_INTERVIEW' | 'CLIENT_INTERVIEW' | 'OFFER' | 'HIRED'

interface Interview {
  id: string
  stage: PipelineStage
  roundLabel: string
  roundNumber: number
  isInternal: boolean
  status: InterviewStatus
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

const STAGE_LABELS: Record<PipelineStage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
}

const STATUS_COLORS: Record<InterviewStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
}

const DECISION_COLORS: Record<InterviewDecision, string> = {
  ADVANCE: 'bg-green-100 text-green-700',
  REJECT: 'bg-red-100 text-red-700',
  HOLD: 'bg-yellow-100 text-yellow-700',
}

function AddInterviewModal({
  candidatePositionId,
  onClose,
  onSaved,
}: {
  candidatePositionId: string
  onClose: () => void
  onSaved: (interview: Interview) => void
}) {
  const [stage, setStage] = useState<PipelineStage>('SCREENING')
  const [roundLabel, setRoundLabel] = useState('')
  const [roundNumber, setRoundNumber] = useState(1)
  const [isInternal, setIsInternal] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/candidate-positions/${candidatePositionId}/interviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          roundLabel,
          roundNumber,
          isInternal,
          scheduledAt: scheduledAt || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to create interview')
        return
      }
      const interview = await res.json()
      onSaved(interview)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
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
              {(Object.keys(STAGE_LABELS) as PipelineStage[]).map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="roundLabel">Round Label</Label>
            <Input
              id="roundLabel"
              value={roundLabel}
              onChange={(e) => setRoundLabel(e.target.value)}
              placeholder="e.g. HR Screen, Technical Round 1"
              required
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="roundNumber">Round #</Label>
              <Input
                id="roundNumber"
                type="number"
                min={1}
                value={roundNumber}
                onChange={(e) => setRoundNumber(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="scheduledAt">Scheduled At</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="isInternal"
              type="checkbox"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="isInternal">Internal interview</Label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Interview'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditInterviewModal({
  interview,
  onClose,
  onSaved,
}: {
  interview: Interview
  onClose: () => void
  onSaved: (interview: Interview) => void
}) {
  const [status, setStatus] = useState<InterviewStatus>(interview.status)
  const [scheduledAt, setScheduledAt] = useState(
    interview.scheduledAt ? interview.scheduledAt.slice(0, 16) : ''
  )
  const [feedbackText, setFeedbackText] = useState(interview.feedbackText ?? '')
  const [decision, setDecision] = useState<InterviewDecision | ''>(interview.decision ?? '')
  const [decisionNotes, setDecisionNotes] = useState(interview.decisionNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/interviews/${interview.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          feedbackText: feedbackText || null,
          decision: decision || null,
          decisionNotes: decisionNotes || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to update')
        return
      }
      onSaved(await res.json())
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Edit Interview</h2>
        <p className="text-sm text-gray-500 mb-4">{interview.roundLabel} · {STAGE_LABELS[interview.stage]}</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as InterviewStatus)}
                className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
              >
                <option value="PENDING">Pending</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <Label htmlFor="scheduledAt2">Scheduled At</Label>
              <Input
                id="scheduledAt2"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="feedbackText">Feedback Notes</Label>
            <textarea
              id="feedbackText"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
              placeholder="Interviewer notes…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="decision">Decision</Label>
              <select
                id="decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value as InterviewDecision | '')}
                className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
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
                className="mt-1"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function InterviewsSection({ candidatePositionId }: { candidatePositionId: string }) {
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Interview | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidate-positions/${candidatePositionId}/interviews`)
      if (res.ok) setInterviews(await res.json())
    } finally {
      setLoading(false)
    }
  }, [candidatePositionId])

  useEffect(() => { load() }, [load])

  function handleAdded(interview: Interview) {
    setInterviews((prev) => [...prev, interview])
    setShowAdd(false)
  }

  function handleUpdated(interview: Interview) {
    setInterviews((prev) => prev.map((i) => (i.id === interview.id ? interview : i)))
    setEditing(null)
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
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900">{interview.roundLabel}</span>
                    <span className="text-xs text-gray-500">{STAGE_LABELS[interview.stage]}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[interview.status]}`}>
                      {interview.status.charAt(0) + interview.status.slice(1).toLowerCase()}
                    </span>
                    {interview.decision && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_COLORS[interview.decision]}`}>
                        {interview.decision.charAt(0) + interview.decision.slice(1).toLowerCase()}
                      </span>
                    )}
                  </div>
                  {interview.scheduledAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      Scheduled: {new Date(interview.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
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
          onClose={() => setShowAdd(false)}
          onSaved={handleAdded}
        />
      )}
      {editing && (
        <EditInterviewModal
          interview={editing}
          onClose={() => setEditing(null)}
          onSaved={handleUpdated}
        />
      )}
    </div>
  )
}
