'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface FeedbackData {
  interviewId: string
  stage: string
  candidateName: string
  positionTitle: string
  client: string
  jdSkills: string[]
  skillLimit: number
  used: boolean
  expired: boolean
  invalid: boolean
}

interface SkillRating {
  skillName: string
  rating: number
  comment: string
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-2xl transition-colors ${n <= value ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function FeedbackPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<FeedbackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [overallScore, setOverallScore] = useState(0)
  const [generalNotes, setGeneralNotes] = useState('')
  const [skillRatings, setSkillRatings] = useState<SkillRating[]>([])

  useEffect(() => {
    fetch(`/api/feedback/${token}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        if (d.jdSkills?.length) {
          const limit = typeof d.skillLimit === 'number' && d.skillLimit > 0 ? d.skillLimit : 6
          const skills = d.jdSkills.slice(0, limit)
          setSkillRatings(skills.map((s: string) => ({ skillName: s, rating: 0, comment: '' })))
        }
      })
      .catch(() => setData({ invalid: true } as FeedbackData))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (overallScore === 0) { setError('Please provide an overall score.'); return }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/feedback/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overallScore, generalNotes, skillRatings }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Submission failed')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (!data || data.invalid) {
    return <ErrorState title="Invalid link" message="This feedback link is invalid or does not exist." />
  }
  if (data.used) {
    return <ErrorState title="Already submitted" message="Feedback for this interview has already been submitted. Thank you!" />
  }
  if (data.expired) {
    return <ErrorState title="Link expired" message="This feedback link has expired. Please contact the recruiter if you still need to submit feedback." />
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Thank you!</h1>
          <p className="text-gray-600">Your feedback has been submitted and will help us make the best decision for this role.</p>
        </div>
      </div>
    )
  }

  const isTechnical = data.stage === 'TECHNICAL_INTERVIEW'

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-8">
            <p className="text-sm text-gray-500 uppercase tracking-wide font-medium mb-1">Interview Feedback</p>
            <h1 className="text-2xl font-bold text-gray-900">{data.candidateName}</h1>
            <p className="text-gray-600 mt-1">{data.positionTitle} · {data.client}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {isTechnical && skillRatings.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-gray-900 mb-4">Skill Assessment</h2>
                <div className="space-y-5">
                  {skillRatings.map((sr, i) => (
                    <div key={sr.skillName} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-800">{sr.skillName}</span>
                        <StarRating
                          value={sr.rating}
                          onChange={(v) =>
                            setSkillRatings((prev) => prev.map((r, j) => j === i ? { ...r, rating: v } : r))
                          }
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Optional comment"
                        value={sr.comment}
                        onChange={(e) =>
                          setSkillRatings((prev) => prev.map((r, j) => j === i ? { ...r, comment: e.target.value } : r))
                        }
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Overall Assessment</h2>
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-2">Overall Score <span className="text-red-500">*</span></label>
                <StarRating value={overallScore} onChange={setOverallScore} />
                {overallScore > 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    {['', 'Poor fit', 'Below average', 'Mixed / average', 'Strong fit', 'Excellent fit'][overallScore]}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-2">General Notes</label>
                {isTechnical && skillRatings.length > 0 && (
                  <p className="text-xs text-gray-400 mb-1">Cover any additional relevant skills not listed above in your notes.</p>
                )}
                <textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Share your overall impressions, key strengths, concerns, and recommendation…"
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </section>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-xl transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Feedback'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}
