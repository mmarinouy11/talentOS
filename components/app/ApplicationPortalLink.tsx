'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ApplicationPortalLinkProps {
  positionId: string
  initialToken: string | null
  screeningQuestions: string[]
}

export function ApplicationPortalLink({ positionId, initialToken, screeningQuestions: initialQuestions }: ApplicationPortalLinkProps) {
  const [token, setToken] = useState(initialToken)
  const [questions, setQuestions] = useState<string[]>(initialQuestions)
  const [copyDone, setCopyDone] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [savingQuestions, setSavingQuestions] = useState(false)
  const [questionsFeedback, setQuestionsFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
<<<<<<< HEAD
=======
  const [regeneratingQuestions, setRegeneratingQuestions] = useState(false)
>>>>>>> origin/claude/loving-cray-m76Oa

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const applyUrl = token ? `${baseUrl}/apply/${token}` : null

  async function handleCopy() {
    if (!applyUrl) return
    await navigator.clipboard.writeText(applyUrl)
    setCopyDone(true)
    setTimeout(() => setCopyDone(false), 2000)
  }

  async function handleRegenerate() {
    if (!confirm('Regenerate the application link? The previous link will stop working immediately.')) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/positions/${positionId}/regenerate-application-token`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setToken(data.applicationToken)
      }
    } finally {
      setRegenerating(false)
    }
  }

<<<<<<< HEAD
=======
  async function handleRegenerateQuestions() {
    setRegeneratingQuestions(true)
    setQuestionsFeedback(null)
    try {
      const res = await fetch(`/api/positions/${positionId}/regenerate-questions`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setQuestions(data.screeningQuestions)
        setQuestionsFeedback({ ok: true, msg: 'Questions regenerated.' })
      } else {
        const data = await res.json().catch(() => ({}))
        setQuestionsFeedback({ ok: false, msg: data.error ?? 'Failed to regenerate.' })
      }
    } catch {
      setQuestionsFeedback({ ok: false, msg: 'Network error.' })
    } finally {
      setRegeneratingQuestions(false)
    }
  }

>>>>>>> origin/claude/loving-cray-m76Oa
  async function handleSaveQuestions() {
    setSavingQuestions(true)
    setQuestionsFeedback(null)
    try {
      const res = await fetch(`/api/positions/${positionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screeningQuestions: questions }),
      })
      if (res.ok) {
        setQuestionsFeedback({ ok: true, msg: 'Questions saved.' })
      } else {
        setQuestionsFeedback({ ok: false, msg: 'Failed to save.' })
      }
    } catch {
      setQuestionsFeedback({ ok: false, msg: 'Network error.' })
    } finally {
      setSavingQuestions(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Link section */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500">Share this link on LinkedIn or job boards to collect direct applications.</p>
        {applyUrl ? (
          <>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={applyUrl}
                className="flex-1 text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 select-all"
                onFocus={(e) => e.target.select()}
              />
              <Button type="button" variant="outline" onClick={handleCopy}>
                {copyDone ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="text-amber-600 border-amber-200 hover:bg-amber-50"
            >
              {regenerating ? 'Regenerating…' : 'Regenerate Link'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">No link yet.</p>
        )}
      </div>

      {/* Screening Questions */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
<<<<<<< HEAD
        <p className="text-xs font-medium text-gray-700">Screening Questions</p>
        <p className="text-xs text-gray-400">These are shown to applicants on the form. Auto-generated from JD; edit as needed.</p>
        {questions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No questions yet — will be generated when the JD is parsed.</p>
=======
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-700">Screening Questions</p>
          <Button
            type="button"
            variant="outline"
            onClick={handleRegenerateQuestions}
            disabled={regeneratingQuestions}
            className="text-xs h-7 px-2"
          >
            {regeneratingQuestions ? 'Generating…' : questions.length > 0 ? 'Regenerate Questions' : 'Generate Questions'}
          </Button>
        </div>
        <p className="text-xs text-gray-400">These are shown to applicants on the form. Auto-generated from JD; edit as needed.</p>
        {questions.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No questions yet — click "Generate Questions" above to create them from the JD.</p>
>>>>>>> origin/claude/loving-cray-m76Oa
        ) : (
          questions.map((q, i) => (
            <div key={i}>
              <label className="text-xs text-gray-500 mb-1 block">Question {i + 1}</label>
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  const next = [...questions]
                  next[i] = e.target.value
                  setQuestions(next)
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))
        )}
        {questions.length > 0 && (
          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSaveQuestions} disabled={savingQuestions}>
              {savingQuestions ? 'Saving…' : 'Save Questions'}
            </Button>
            {questionsFeedback && (
              <span className={`text-sm ${questionsFeedback.ok ? 'text-green-600' : 'text-red-600'}`}>
                {questionsFeedback.msg}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
