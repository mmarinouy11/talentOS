'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

const COUNTRIES = [
  'Argentina', 'Bolivia', 'Brazil', 'Canada', 'Chile', 'Colombia',
  'Costa Rica', 'Cuba', 'Dominican Republic', 'Ecuador', 'El Salvador',
  'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Mexico', 'Nicaragua',
  'Panama', 'Paraguay', 'Peru', 'Puerto Rico', 'Spain',
  'Trinidad and Tobago', 'United States', 'Uruguay', 'Venezuela', 'Other',
]

interface Check {
  name: string
  passed: boolean
  detail: string
}

interface PositionData {
  id: string
  title: string
  client: string
  description: string
  location: string[]
  budgetMonthly: number | null
  screeningQuestions: string[]
}

type PageState = 'loading' | 'invalid' | 'form' | 'submitting' | 'success' | 'rejected'

const inputClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [position, setPosition] = useState<PositionData | null>(null)
  const [showFullJD, setShowFullJD] = useState(false)

  // Form fields
  const [file, setFile] = useState<File | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [country, setCountry] = useState('')
  const [desiredCompensation, setDesiredCompensation] = useState('')
  const [currentCompensation, setCurrentCompensation] = useState('')
  const [answers, setAnswers] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [answersErrors, setAnswersErrors] = useState<boolean[]>([])

  // Result
  const [rejectionChecks, setRejectionChecks] = useState<Check[]>([])
  const [rejectionMessage, setRejectionMessage] = useState('')
  const [fitScore, setFitScore] = useState<number | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/apply/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setState('invalid'); return }
        setPosition(d)
        setAnswers(new Array(d.screeningQuestions.length).fill(''))
        setState('form')
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/cv/upload', { method: 'POST', body: fd })
      if (res.ok) {
        const d = await res.json()
        if (d.parsed) {
          if (d.parsed.firstName && !firstName) setFirstName(d.parsed.firstName)
          if (d.parsed.lastName && !lastName) setLastName(d.parsed.lastName)
          if (d.parsed.email && !email) setEmail(d.parsed.email)
          if (d.parsed.country && !country) setCountry(d.parsed.country)
        }
      }
    } catch {
      // non-fatal
    } finally {
      setParsing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!position || !file) return

    // Validate screening questions
    if (position.screeningQuestions.length > 0) {
      const errors = answers.map((a) => !a.trim())
      setAnswersErrors(errors)
      if (errors.some(Boolean)) return
    }

    setState('submitting')
    setSubmitError('')
    try {
      const fd = new FormData()
      fd.append('cv', file)
      fd.append('firstName', firstName)
      fd.append('lastName', lastName)
      fd.append('email', email)
      fd.append('phone', phone)
      fd.append('linkedin', linkedin)
      fd.append('country', country)
      fd.append('desiredCompensation', desiredCompensation)
      fd.append('currentCompensation', currentCompensation)
      answers.forEach((a, i) => fd.append(`answer_${i}`, a))

      const res = await fetch(`/api/apply/${token}/submit`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok && !d.rejected) {
        setSubmitError(d.error ?? 'Submission failed. Please try again.')
        setState('form')
        return
      }
      if (d.rejected) {
        setRejectionChecks(d.checks ?? [])
        setRejectionMessage(d.message ?? '')
        setFitScore(d.fitScore ?? null)
        setState('rejected')
      } else {
        setFitScore(d.fitScore ?? null)
        setState('success')
      }
    } catch {
      setSubmitError('Network error. Please try again.')
      setState('form')
    }
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (state === 'invalid' || !position) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid link</h1>
          <p className="text-gray-500 text-sm">This application link is invalid or the position is no longer accepting applications.</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Application submitted!</h1>
          <p className="text-gray-500 text-sm mb-4">
            Your application for <strong>{position.title}</strong> has been received.
            The recruiting team will be in touch if your profile is a match.
          </p>
          {fitScore !== null && (
            <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-1.5 text-sm text-green-700 font-medium">
              Profile match: {fitScore}%
            </div>
          )}
        </div>
      </div>
    )
  }

  if (state === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">😔</div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Application not accepted</h1>
            <p className="text-sm text-gray-500">{rejectionMessage}</p>
          </div>
          <div className="space-y-3">
            {rejectionChecks.map((c, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${c.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <span className="text-lg mt-0.5">{c.passed ? '✅' : '❌'}</span>
                <div>
                  <p className={`text-sm font-medium ${c.passed ? 'text-green-800' : 'text-red-800'}`}>{c.name}</p>
                  <p className={`text-xs mt-0.5 ${c.passed ? 'text-green-600' : 'text-red-600'}`}>{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const jdText = position.description

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Tenarai</p>
          <h1 className="text-2xl font-bold text-gray-900">{position.title}</h1>
          {position.location.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {position.location.map((loc) => (
                <span key={loc} className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {loc}
                </span>
              ))}
            </div>
          )}
          {jdText && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowFullJD((v) => !v)}
                className="text-sm text-blue-600 hover:underline"
              >
                {showFullJD ? 'Hide job description ▲' : 'View job description ▼'}
              </button>
              {showFullJD && (
                <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border-t border-gray-100 pt-3">
                  {jdText}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Application form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Your application</h2>

          {/* CV upload */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              CV / Resume <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(PDF)</span>
            </label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <p className="text-sm text-gray-700">{file.name}</p>
              ) : (
                <p className="text-sm text-gray-400">Click to upload your CV (PDF)</p>
              )}
              {parsing && <p className="text-xs text-blue-500 mt-1">Parsing CV…</p>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name <span className="text-red-500">*</span></label>
              <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name <span className="text-red-500">*</span></label>
              <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>

          {/* Phone + LinkedIn */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">LinkedIn URL</label>
              <input type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className={inputClass} placeholder="https://linkedin.com/in/…" />
            </div>
          </div>

          {/* Country */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Country <span className="text-red-500">*</span></label>
            <select required value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass}>
              <option value="">Select country…</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Compensation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Desired Compensation <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal ml-1">(USD/month)</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="100"
                value={desiredCompensation}
                onChange={(e) => setDesiredCompensation(e.target.value)}
                className={inputClass}
                placeholder="e.g. 5000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Current Compensation
                <span className="text-gray-400 font-normal ml-1">(USD/month)</span>
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={currentCompensation}
                onChange={(e) => setCurrentCompensation(e.target.value)}
                className={inputClass}
                placeholder="optional"
              />
            </div>
          </div>

          {/* Screening questions */}
          {position.screeningQuestions.length > 0 && (
            <div className="space-y-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-700">Screening Questions <span className="text-red-500">*</span></p>
              {position.screeningQuestions.map((q, i) => (
                <div key={i}>
                  <label className="block text-xs text-gray-700 mb-1">{i + 1}. {q}</label>
                  <input
                    type="text"
                    value={answers[i] ?? ''}
                    onChange={(e) => {
                      const next = [...answers]
                      next[i] = e.target.value
                      setAnswers(next)
                      if (answersErrors[i]) {
                        const errs = [...answersErrors]
                        errs[i] = false
                        setAnswersErrors(errs)
                      }
                    }}
                    className={`${inputClass} ${answersErrors[i] ? 'border-red-400 focus:ring-red-400' : ''}`}
                    placeholder="Your answer…"
                  />
                  {answersErrors[i] && (
                    <p className="text-xs text-red-600 mt-1">This question requires an answer.</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {submitError && (
            <p className="text-sm text-red-600">{submitError}</p>
          )}

          <button
            type="submit"
            disabled={state === 'submitting' || !file}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl px-4 py-2.5 text-sm transition-colors"
          >
            {state === 'submitting' ? 'Submitting…' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}
