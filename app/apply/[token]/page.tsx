'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { BrandHeader } from '@/components/public/BrandHeader'

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
  transition: 'border-color 0.15s',
}

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: '1.5px solid #e53e3e',
}

function InputField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2F2C29', marginBottom: 6, fontFamily: 'Arial, "Open Sans", sans-serif' }}>
        {label}
        {required && <span style={{ color: '#8CF000', marginLeft: 3 }}>*</span>}
        {hint && <span style={{ color: '#9a9490', fontWeight: 400, marginLeft: 6 }}>{hint}</span>}
      </label>
      {children}
      {error && <p style={{ color: '#e53e3e', fontSize: 12, marginTop: 4 }}>This field is required.</p>}
    </div>
  )
}

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [position, setPosition] = useState<PositionData | null>(null)
  const [showFullJD, setShowFullJD] = useState(false)

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
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [consentError, setConsentError] = useState(false)

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

    if (position.screeningQuestions.length > 0) {
      const errors = answers.map((a) => !a.trim())
      setAnswersErrors(errors)
      if (errors.some(Boolean)) return
    }

    if (!consentChecked) {
      setConsentError(true)
      return
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

  // ─── Loading ───
  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F0EB' }}>
        <p style={{ color: '#9a9490', fontFamily: 'Arial, "Open Sans", sans-serif' }}>Loading…</p>
      </div>
    )
  }

  // ─── Invalid ───
  if (state === 'invalid' || !position) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F0EB' }}>
        <BrandHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2F2C29', marginBottom: 8, fontFamily: 'Arial, "Open Sans", sans-serif' }}>Invalid link</h1>
            <p style={{ color: '#9a9490', fontSize: 14, fontFamily: 'Arial, "Open Sans", sans-serif' }}>This application link is invalid or the position is no longer accepting applications.</p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Success ───
  if (state === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F0EB' }}>
        <BrandHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#8CF000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>✓</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2F2C29', marginBottom: 10, fontFamily: 'Arial, "Open Sans", sans-serif' }}>Application submitted!</h1>
            <p style={{ color: '#6b6560', fontSize: 14, lineHeight: 1.6, fontFamily: 'Arial, "Open Sans", sans-serif' }}>
              Your application for <strong>{position.title}</strong> has been received. The recruiting team will be in touch if your profile is a match.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Rejected ───
  if (state === 'rejected') {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F0EB' }}>
        <BrandHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '40px', maxWidth: 480, width: '100%', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>😔</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2F2C29', marginBottom: 8, fontFamily: 'Arial, "Open Sans", sans-serif' }}>Application not accepted</h1>
              <p style={{ color: '#6b6560', fontSize: 14, fontFamily: 'Arial, "Open Sans", sans-serif' }}>{rejectionMessage}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rejectionChecks.map((c, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  borderRadius: 12, padding: '12px 16px',
                  background: c.passed ? '#f0fde0' : '#fff5f5',
                  border: `1px solid ${c.passed ? '#c4f060' : '#fca5a5'}`,
                }}>
                  <span style={{ fontSize: 16, marginTop: 1 }}>{c.passed ? '✅' : '❌'}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: c.passed ? '#3a6600' : '#b91c1c', fontFamily: 'Arial, "Open Sans", sans-serif', marginBottom: 2 }}>{c.name}</p>
                    <p style={{ fontSize: 12, color: c.passed ? '#4d7c0f' : '#dc2626', fontFamily: 'Arial, "Open Sans", sans-serif' }}>{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Form ───
  return (
    <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
      <BrandHeader />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 16px 60px' }}>

        {/* Position hero */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '32px 36px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a9490', marginBottom: 10 }}>Open Position</p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#2F2C29', lineHeight: 1.2, marginBottom: 12 }}>{position.title}</h1>
          <div style={{ height: 3, width: 48, background: '#8CF000', borderRadius: 2, marginBottom: 14 }} />
          {position.location.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: position.description ? 16 : 0 }}>
              {position.location.map((loc) => (
                <span key={loc} style={{ background: '#F5F0EB', border: '1px solid #e5e0da', borderRadius: 999, padding: '4px 12px', fontSize: 12, color: '#5a5550', fontWeight: 500 }}>{loc}</span>
              ))}
            </div>
          )}
          {position.description && (
            <div style={{ borderTop: '1px solid #f0ebe5', paddingTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowFullJD((v) => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2F2C29', fontSize: 13, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ color: '#8CF000', fontSize: 16 }}>{showFullJD ? '▲' : '▼'}</span>
                {showFullJD ? 'Hide job description' : 'View job description'}
              </button>
              {showFullJD && (
                <div style={{ marginTop: 14, fontSize: 14, color: '#4a4540', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {position.description}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Application form */}
        <form onSubmit={handleSubmit}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '32px 36px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2F2C29', marginBottom: 24 }}>Your Application</h2>

            {/* CV Upload */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2F2C29', marginBottom: 6 }}>
                CV / Resume <span style={{ color: '#8CF000' }}>*</span>
                <span style={{ color: '#9a9490', fontWeight: 400, marginLeft: 6 }}>(PDF)</span>
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${file ? '#8CF000' : '#d5d0ca'}`,
                  borderRadius: 12,
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: file ? '#f9ffe6' : '#fafaf8',
                  transition: 'all 0.15s',
                }}
              >
                {file ? (
                  <p style={{ fontSize: 14, color: '#3a6600', fontWeight: 500 }}>📄 {file.name}</p>
                ) : (
                  <>
                    <p style={{ fontSize: 14, color: '#9a9490' }}>Click to upload your CV</p>
                    <p style={{ fontSize: 12, color: '#b5b0aa', marginTop: 4 }}>PDF only · Max 10MB</p>
                  </>
                )}
                {parsing && <p style={{ fontSize: 12, color: '#5a8a00', marginTop: 6 }}>Parsing CV…</p>}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>

            {/* Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <InputField label="First Name" required>
                <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
              <InputField label="Last Name" required>
                <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <InputField label="Email" required>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
            </div>

            {/* Phone + LinkedIn */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <InputField label="Phone">
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="+1 555 000 0000"
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
              <InputField label="LinkedIn URL">
                <input type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} style={inputStyle} placeholder="https://linkedin.com/in/…"
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
            </div>

            {/* Country */}
            <div style={{ marginBottom: 16 }}>
              <InputField label="Country" required>
                <select required value={country} onChange={(e) => setCountry(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                >
                  <option value="">Select country…</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </InputField>
            </div>

            {/* Compensation */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
              <InputField label="Desired Compensation" required hint="(USD/month)">
                <input type="number" required min="0" step="100" value={desiredCompensation} onChange={(e) => setDesiredCompensation(e.target.value)} style={inputStyle} placeholder="e.g. 5000"
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
              <InputField label="Current Compensation" hint="(USD/month, optional)">
                <input type="number" min="0" step="100" value={currentCompensation} onChange={(e) => setCurrentCompensation(e.target.value)} style={inputStyle} placeholder="optional"
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
            </div>

            {/* Screening questions */}
            {position.screeningQuestions.length > 0 && (
              <div style={{ marginTop: 24, borderLeft: '3px solid #8CF000', background: '#F5F0EB', borderRadius: '0 14px 14px 0', padding: '20px 20px 20px 20px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#2F2C29', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Screening Questions <span style={{ color: '#8CF000' }}>*</span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {position.screeningQuestions.map((q, i) => (
                    <div key={i}>
                      <label style={{ display: 'block', fontSize: 13, color: '#2F2C29', marginBottom: 6, fontWeight: 500 }}>{i + 1}. {q}</label>
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
                        style={answersErrors[i] ? inputErrorStyle : inputStyle}
                        placeholder="Your answer…"
                        onFocus={(e) => { if (!answersErrors[i]) { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' } }}
                        onBlur={(e) => { if (!answersErrors[i]) { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' } }}
                      />
                      {answersErrors[i] && (
                        <p style={{ color: '#e53e3e', fontSize: 12, marginTop: 4 }}>This question requires an answer.</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Privacy notice */}
            <div style={{ marginTop: 24, borderTop: '1px solid #f0ebe5', paddingTop: 18 }}>
              <button
                type="button"
                onClick={() => setPrivacyOpen((v) => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6560', fontSize: 13, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Arial, "Open Sans", sans-serif' }}
              >
                <span style={{ color: '#8CF000', fontSize: 14 }}>{privacyOpen ? '▲' : '▼'}</span>
                View Privacy Notice
              </button>
              {privacyOpen && (
                <div style={{ marginTop: 12, background: '#f5f0eb', borderRadius: 10, padding: '14px 16px', fontSize: 12, color: '#4a4540', lineHeight: 1.7 }}>
                  <strong style={{ display: 'block', marginBottom: 6, color: '#2F2C29' }}>Privacy Notice</strong>
                  <p style={{ marginBottom: 8 }}>Tenarai LATAM collects and processes the personal data you provide (including your name, contact information, resume, and compensation expectations) for the purpose of evaluating your candidacy for the position you are applying for.</p>
                  <p style={{ marginBottom: 8 }}>Your data may be shared with our client companies solely for recruitment purposes. We retain your data for up to 12 months after your application, after which it is deleted unless you are hired or you request earlier deletion.</p>
                  <p>You have the right to access, correct, or request deletion of your personal data at any time by contacting <a href="mailto:hr.latam@tenarai.com" style={{ color: '#5a8a00' }}>hr.latam@tenarai.com</a>.</p>
                </div>
              )}
            </div>

            {/* Consent checkbox */}
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => { setConsentChecked(e.target.checked); if (e.target.checked) setConsentError(false) }}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: '#8CF000', flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12, color: consentError ? '#e53e3e' : '#6b6560', lineHeight: 1.5, fontFamily: 'Arial, "Open Sans", sans-serif' }}>
                  I have read and agree to the processing of my personal data as described in the Privacy Notice above.
                  <span style={{ color: '#8CF000', marginLeft: 3 }}>*</span>
                </span>
              </label>
              {consentError && (
                <p style={{ color: '#e53e3e', fontSize: 12, marginTop: 4, marginLeft: 26 }}>You must accept the privacy notice to continue.</p>
              )}
            </div>

            {submitError && (
              <p style={{ color: '#e53e3e', fontSize: 13, marginTop: 16 }}>{submitError}</p>
            )}

            <button
              type="submit"
              disabled={state === 'submitting' || !file}
              style={{
                width: '100%',
                marginTop: 28,
                background: state === 'submitting' || !file ? '#d5d0ca' : '#8CF000',
                color: state === 'submitting' || !file ? '#9a9490' : '#000',
                border: 'none',
                borderRadius: 12,
                padding: '14px 24px',
                fontSize: 15,
                fontWeight: 700,
                cursor: state === 'submitting' || !file ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                fontFamily: 'Arial, "Open Sans", sans-serif',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => { if (state !== 'submitting' && file) (e.target as HTMLButtonElement).style.background = '#7ada00' }}
              onMouseLeave={(e) => { if (state !== 'submitting' && file) (e.target as HTMLButtonElement).style.background = '#8CF000' }}
            >
              {state === 'submitting' ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
