'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { BrandHeader } from '@/components/public/BrandHeader'

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

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1.5px solid #e5e0da',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 14,
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'Arial, "Open Sans", sans-serif',
  color: '#2F2C29',
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 28,
            color: n <= (hovered || value) ? '#8CF000' : '#d5d0ca',
            transition: 'color 0.1s',
            padding: '0 2px',
          }}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
      <BrandHeader />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2F2C29', marginBottom: 8 }}>{title}</h1>
          <p style={{ color: '#9a9490', fontSize: 14 }}>{message}</p>
        </div>
      </div>
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F0EB' }}>
        <p style={{ color: '#9a9490', fontFamily: 'Arial, "Open Sans", sans-serif' }}>Loading…</p>
      </div>
    )
  }

  if (!data || data.invalid) return <ErrorState title="Invalid link" message="This feedback link is invalid or does not exist." />
  if (data.used) return <ErrorState title="Already submitted" message="Feedback for this interview has already been submitted. Thank you!" />
  if (data.expired) return <ErrorState title="Link expired" message="This feedback link has expired. Please contact the recruiter if you still need to submit feedback." />

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
        <BrandHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#8CF000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>✓</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2F2C29', marginBottom: 10 }}>Thank you!</h1>
            <p style={{ color: '#6b6560', fontSize: 14, lineHeight: 1.6 }}>Your feedback has been submitted and will help us make the best decision for this role.</p>
          </div>
        </div>
      </div>
    )
  }

  const isTechnical = data.stage === 'TECHNICAL_INTERVIEW'
  const scoreLabels = ['', 'Poor fit', 'Below average', 'Mixed / average', 'Strong fit', 'Excellent fit']

  return (
    <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
      <BrandHeader />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 16px 60px' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '36px 36px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>

          {/* Hero */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a9490', marginBottom: 8 }}>Interview Feedback</p>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#2F2C29', marginBottom: 6 }}>{data.candidateName}</h1>
            <div style={{ height: 3, width: 40, background: '#8CF000', borderRadius: 2, marginBottom: 10 }} />
            <p style={{ fontSize: 14, color: '#6b6560' }}>{data.positionTitle}</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* Skill assessment */}
            {isTechnical && skillRatings.length > 0 && (
              <section>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#2F2C29', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Skill Assessment</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {skillRatings.map((sr, i) => (
                    <div key={sr.skillName} style={{ border: '1.5px solid #e5e0da', borderRadius: 14, padding: '16px 18px', background: '#fafaf8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#2F2C29' }}>{sr.skillName}</span>
                        <StarRating
                          value={sr.rating}
                          onChange={(v) => setSkillRatings((prev) => prev.map((r, j) => j === i ? { ...r, rating: v } : r))}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Optional comment"
                        value={sr.comment}
                        onChange={(e) => setSkillRatings((prev) => prev.map((r, j) => j === i ? { ...r, comment: e.target.value } : r))}
                        style={inputStyle}
                        onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                        onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Overall assessment */}
            <section>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#2F2C29', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall Assessment</h2>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#6b6560', marginBottom: 8, fontWeight: 500 }}>
                  Overall Score <span style={{ color: '#8CF000' }}>*</span>
                </label>
                <StarRating value={overallScore} onChange={setOverallScore} />
                {overallScore > 0 && (
                  <p style={{ fontSize: 13, color: '#5a8a00', marginTop: 6, fontWeight: 500 }}>{scoreLabels[overallScore]}</p>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b6560', marginBottom: 6, fontWeight: 500 }}>General Notes</label>
                {isTechnical && skillRatings.length > 0 && (
                  <p style={{ fontSize: 12, color: '#9a9490', marginBottom: 6 }}>Cover any additional relevant skills not listed above in your notes.</p>
                )}
                <textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Share your overall impressions, key strengths, concerns, and recommendation…"
                  rows={5}
                  style={{ ...inputStyle, resize: 'none' }}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </section>

            {error && <p style={{ color: '#e53e3e', fontSize: 13 }}>{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                background: submitting ? '#d5d0ca' : '#8CF000',
                color: submitting ? '#9a9490' : '#000',
                border: 'none',
                borderRadius: 12,
                padding: '14px 24px',
                fontSize: 15,
                fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                fontFamily: 'Arial, "Open Sans", sans-serif',
              }}
              onMouseEnter={(e) => { if (!submitting) (e.target as HTMLButtonElement).style.background = '#7ada00' }}
              onMouseLeave={(e) => { if (!submitting) (e.target as HTMLButtonElement).style.background = '#8CF000' }}
            >
              {submitting ? 'Submitting…' : 'Submit Feedback'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
