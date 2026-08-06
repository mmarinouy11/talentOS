'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { BrandHeader } from '@/components/public/BrandHeader'

const LATAM_COUNTRIES = [
  'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador',
  'Mexico', 'Paraguay', 'Peru', 'Uruguay', 'Venezuela', 'Other',
]

interface Check {
  name: string
  passed: boolean
  detail: string
}

interface ExistingCandidate {
  firstNameInitial: string
  country: string | null
}

interface Position {
  id: string
  title: string
  client: string
  status: string
  jdRaw: string | null
  jdSummary: string | null
  location: string[]
  budgetMonthly: number | null
  timezone: string
  existingCandidates: ExistingCandidate[]
}

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4)
  const m = (i % 4) * 15
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mm} ${h < 12 ? 'AM' : 'PM'}`
  return { value: `${hh}:${mm}`, label }
})

function tzAbbr(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? timezone
  } catch {
    return timezone
  }
}

function isSlotInPast(date: string, time: string): boolean {
  if (!date || !time) return false
  return new Date(`${date}T${time}`) <= new Date()
}

interface Submission {
  id: string
  firstName: string
  lastName: string
  country: string | null
  positionTitle: string
  stage: string
  isActive: boolean
  decisionNotes: string | null
  submittedAt: string
}

interface VendorData {
  vendorId: string
  vendorName: string
  positions: Position[]
  submissions: Submission[]
}

type PageState = 'loading' | 'invalid' | 'list' | 'submit' | 'success' | 'rejected'
type RejectionReason = 'duplicate' | 'low_score' | 'over_budget'

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

function InputField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2F2C29', marginBottom: 6, fontFamily: 'Arial, "Open Sans", sans-serif' }}>
        {label}
        {required && <span style={{ color: '#8CF000', marginLeft: 3 }}>*</span>}
        {hint && <span style={{ color: '#9a9490', fontWeight: 400, marginLeft: 6 }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

export default function VendorPortalPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [data, setData] = useState<VendorData | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('')
  const [desiredCompensation, setDesiredCompensation] = useState('')
  const [parsing, setParsing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [availabilitySlots, setAvailabilitySlots] = useState<{ date: string; time: string }[]>([])
  const [consentChecked, setConsentChecked] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [rejectionReason, setRejectionReason] = useState<RejectionReason | null>(null)
  const [rejectionMessage, setRejectionMessage] = useState('')
  const [rejectionChecks, setRejectionChecks] = useState<Check[]>([])
  const [cvDragOver, setCvDragOver] = useState(false)
  const [expandedJD, setExpandedJD] = useState<Set<string>>(new Set())
  const [expandedPipeline, setExpandedPipeline] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'positions' | 'submissions'>('positions')
  const [submissionsSearch, setSubmissionsSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/vendor-portal/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setState('invalid'); return }
        setData(d)
        setState('list')
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setParsing(true)
    setSubmitError('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/cv/upload', { method: 'POST', body: fd })
      if (res.ok) {
        const d = await res.json()
        if (d.parsed) {
          if (d.parsed.firstName) setFirstName(d.parsed.firstName)
          if (d.parsed.lastName) setLastName(d.parsed.lastName)
          if (d.parsed.email) setEmail(d.parsed.email)
          if (d.parsed.country) setCountry(d.parsed.country)
        }
      }
    } catch {
      // non-fatal
    } finally {
      setParsing(false)
    }
  }

  function addSlot() { if (availabilitySlots.length < 5) setAvailabilitySlots(prev => [...prev, { date: '', time: '09:00' }]) }
  function removeSlot(i: number) { setAvailabilitySlots(prev => prev.filter((_, idx) => idx !== i)) }
  function updateSlot(i: number, field: 'date' | 'time', value: string) {
    setAvailabilitySlots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPosition || !file) return
    if (!consentChecked) {
      setConsentError(true)
      return
    }
    if (availabilitySlots.length === 0) {
      setSubmitError('Please add at least one availability slot before submitting.')
      return
    }
    if (availabilitySlots.some((s) => isSlotInPast(s.date, s.time))) {
      setSubmitError('One or more availability slots are in the past. Please update them.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const fd = new FormData()
      fd.append('cv', file)
      fd.append('positionId', selectedPosition.id)
      fd.append('firstName', firstName)
      fd.append('lastName', lastName)
      fd.append('email', email)
      fd.append('country', country)
      fd.append('desiredCompensation', desiredCompensation)
      const isoSlots = availabilitySlots
        .filter(s => s.date && s.time)
        .map(s => new Date(`${s.date}T${s.time}`).toISOString())
      fd.append('availabilitySlots', JSON.stringify(isoSlots))
      const res = await fetch(`/api/vendor-portal/${token}/submit`, { method: 'POST', body: fd })
      const d = await res.json()
      if (d.rejected) {
        setRejectionReason(d.reason as RejectionReason)
        setRejectionMessage(d.message)
        setRejectionChecks(d.checks ?? [])
        setState('rejected')
      } else {
        setState('success')
      }
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function startSubmit(position: Position) {
    setSelectedPosition(position)
    setFile(null)
    setFirstName('')
    setLastName('')
    setEmail('')
    setCountry('')
    setDesiredCompensation('')
    setSubmitError('')
    setAvailabilitySlots([])
    setConsentChecked(false)
    setConsentError(false)
    setState('submit')
  }

  function backToList() {
    setState('list')
    setSelectedPosition(null)
  }

  function toggleJD(id: string) {
    setExpandedJD((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function togglePipeline(id: string) {
    setExpandedPipeline((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function submitAnother() {
    setState('list')
    setSelectedPosition(null)
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
  if (state === 'invalid' || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
        <BrandHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2F2C29', marginBottom: 8 }}>Invalid link</h1>
            <p style={{ color: '#9a9490', fontSize: 14 }}>This link is invalid. Please contact your Tenarai contact for a valid link.</p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Success ───
  if (state === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
        <BrandHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#8CF000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>✓</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2F2C29', marginBottom: 10 }}>Candidate submitted!</h1>
            <p style={{ color: '#6b6560', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>The candidate has been successfully added to the pipeline. Our team will review and be in touch.</p>
            <button
              onClick={submitAnother}
              style={{ background: '#8CF000', color: '#000', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Arial, "Open Sans", sans-serif' }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = '#7ada00' }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = '#8CF000' }}
            >
              Submit another candidate
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Rejected ───
  if (state === 'rejected') {
    const heading =
      rejectionReason === 'duplicate' ? 'Candidate already submitted' :
      rejectionReason === 'over_budget' ? 'Compensation out of range' :
      rejectionReason === 'low_score' ? 'Candidate does not meet requirements' :
      'Submission not accepted'
    return (
      <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
        <BrandHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 16px' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '40px', maxWidth: 480, width: '100%', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>❌</div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2F2C29', marginBottom: 8 }}>{heading}</h1>
              <p style={{ color: '#6b6560', fontSize: 14 }}>{rejectionMessage}</p>
            </div>
            {rejectionChecks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {rejectionChecks.map((check) => (
                  <div key={check.name} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    borderRadius: 12, padding: '12px 16px',
                    background: check.passed ? '#f0fde0' : '#fff5f5',
                    border: `1px solid ${check.passed ? '#c4f060' : '#fca5a5'}`,
                  }}>
                    <span style={{ fontSize: 16, marginTop: 1 }}>{check.passed ? '✅' : '❌'}</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: check.passed ? '#3a6600' : '#b91c1c', marginBottom: 2 }}>{check.name}</p>
                      <p style={{ fontSize: 12, color: check.passed ? '#4d7c0f' : '#dc2626' }}>{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={submitAnother}
                style={{ background: '#8CF000', color: '#000', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Arial, "Open Sans", sans-serif' }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = '#7ada00' }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = '#8CF000' }}
              >
                Try a different candidate
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const openPositions = data.positions.filter((p) => p.status === 'OPEN')
  const submissions = data.submissions ?? []

  // ─── List ───
  if (state === 'list') {
    const tabStyle = (tab: 'positions' | 'submissions'): React.CSSProperties => ({
      padding: '10px 20px',
      fontSize: 14,
      fontWeight: 600,
      border: 'none',
      borderRadius: 10,
      cursor: 'pointer',
      fontFamily: 'Arial, "Open Sans", sans-serif',
      background: activeTab === tab ? '#2F2C29' : 'transparent',
      color: activeTab === tab ? '#8CF000' : '#6b6560',
      transition: 'all 0.15s',
    })

    return (
      <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
        <BrandHeader />
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 16px 60px' }}>
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a9490', marginBottom: 6 }}>Partner Portal</p>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#2F2C29', marginBottom: 6 }}>{data.vendorName}</h1>
            <div style={{ height: 3, width: 40, background: '#8CF000', borderRadius: 2 }} />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#e8e3dd', borderRadius: 12, padding: 4, width: 'fit-content' }}>
            <button style={tabStyle('positions')} onClick={() => setActiveTab('positions')}>
              Open Positions {openPositions.length > 0 && <span style={{ marginLeft: 4, background: activeTab === 'positions' ? '#8CF000' : '#d5d0ca', color: activeTab === 'positions' ? '#000' : '#6b6560', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{openPositions.length}</span>}
            </button>
            <button style={tabStyle('submissions')} onClick={() => setActiveTab('submissions')}>
              My Submissions {submissions.length > 0 && <span style={{ marginLeft: 4, background: activeTab === 'submissions' ? '#8CF000' : '#d5d0ca', color: activeTab === 'submissions' ? '#000' : '#6b6560', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{submissions.length}</span>}
            </button>
          </div>

          {/* ── Tab: Open Positions ── */}
          {activeTab === 'positions' && (
            openPositions.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 20, padding: '40px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                <p style={{ color: '#9a9490', fontSize: 14 }}>No open positions are currently assigned to you. Check back later or contact your Tenarai contact.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {openPositions.map((pos) => {
                  const jdText = pos.jdRaw || pos.jdSummary
                  const jdOpen = expandedJD.has(pos.id)
                  return (
                    <div key={pos.id} style={{ background: '#fff', borderRadius: 20, padding: '24px 28px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                        <div style={{ minWidth: 0 }}>
                          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#2F2C29', marginBottom: 4 }}>{pos.title}</h2>
                          <p style={{ fontSize: 13, color: '#9a9490', marginBottom: 8 }}>Tenarai</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {pos.budgetMonthly != null && (
                              <span style={{ background: '#f0fde0', border: '1px solid #c4f060', borderRadius: 999, padding: '3px 10px', fontSize: 12, color: '#3a6600', fontWeight: 500 }}>
                                Up to ${pos.budgetMonthly.toLocaleString()}/month
                              </span>
                            )}
                            {pos.location.map((loc) => (
                              <span key={loc} style={{ background: '#F5F0EB', border: '1px solid #e5e0da', borderRadius: 999, padding: '3px 10px', fontSize: 12, color: '#5a5550', fontWeight: 500 }}>{loc}</span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => startSubmit(pos)}
                          style={{ flexShrink: 0, background: '#8CF000', color: '#000', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Arial, "Open Sans", sans-serif', whiteSpace: 'nowrap' }}
                          onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = '#7ada00' }}
                          onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = '#8CF000' }}
                        >
                          Submit Candidate
                        </button>
                      </div>
                      {jdText && (
                        <div style={{ marginTop: 14, borderTop: '1px solid #f0ebe5', paddingTop: 12 }}>
                          <button
                            onClick={() => toggleJD(pos.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2F2C29', fontSize: 13, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Arial, "Open Sans", sans-serif' }}
                          >
                            <span style={{ color: '#8CF000', fontSize: 14 }}>{jdOpen ? '▲' : '▼'}</span>
                            {jdOpen ? 'Hide job description' : 'View job description'}
                          </button>
                          {jdOpen && (
                            <div style={{ marginTop: 10, fontSize: 14, color: '#4a4540', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto' }}>
                              {jdText}
                            </div>
                          )}
                        </div>
                      )}
                      {pos.existingCandidates.length > 0 && (
                        <div style={{ marginTop: 12, borderTop: '1px solid #f0ebe5', paddingTop: 12 }}>
                          <button
                            onClick={() => togglePipeline(pos.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2F2C29', fontSize: 13, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Arial, "Open Sans", sans-serif' }}
                          >
                            <span style={{ color: '#9a9490', fontSize: 14 }}>{expandedPipeline.has(pos.id) ? '▲' : '▼'}</span>
                            Already in pipeline ({pos.existingCandidates.length})
                          </button>
                          {expandedPipeline.has(pos.id) && (
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {pos.existingCandidates.map((ec, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#4a4540' }}>
                                  <span style={{ fontWeight: 500 }}>{ec.firstNameInitial}</span>
                                  {ec.country && <span style={{ color: '#9a9490' }}>· {ec.country}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ── Tab: My Submissions ── */}
          {activeTab === 'submissions' && (() => {
            const filteredSubmissions = submissions.filter((s) => {
              if (!submissionsSearch.trim()) return true
              const q = submissionsSearch.toLowerCase()
              return `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
            })
            return submissions.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 20, padding: '40px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                <p style={{ color: '#9a9490', fontSize: 14 }}>No candidates submitted yet. Switch to Open Positions to submit your first candidate.</p>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="Search by name…"
                    value={submissionsSearch}
                    onChange={(e) => setSubmissionsSearch(e.target.value)}
                    style={{ ...inputStyle, maxWidth: 280 }}
                  />
                </div>
                <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                  {filteredSubmissions.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                      <p style={{ color: '#9a9490', fontSize: 14 }}>No results for &quot;{submissionsSearch}&quot;.</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f5f0eb', borderBottom: '1px solid #e8e3dd' }}>
                          {['Candidate', 'Country', 'Position', 'Stage', 'Status', 'Submitted'].map((h) => (
                            <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9a9490' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSubmissions.map((s, i) => (
                          <tr key={s.id} style={{ borderBottom: i < filteredSubmissions.length - 1 ? '1px solid #f0ebe5' : 'none' }}>
                            <td style={{ padding: '14px 16px', fontWeight: 600, color: '#2F2C29' }}>
                              {s.firstName} {s.lastName}
                            </td>
                            <td style={{ padding: '14px 16px', color: '#4a4540' }}>{s.country ?? '—'}</td>
                            <td style={{ padding: '14px 16px', color: '#4a4540' }}>{s.positionTitle}</td>
                            <td style={{ padding: '14px 16px', color: '#4a4540' }}>
                              {s.stage}
                              {s.decisionNotes && (
                                <div style={{ fontSize: 12, color: '#9a9490', marginTop: 3 }}>
                                  <span style={{ fontWeight: 600 }}>Note:</span> {s.decisionNotes}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{
                                background: s.isActive ? '#f0fde0' : '#fff5f5',
                                color: s.isActive ? '#3a6600' : '#b91c1c',
                                border: `1px solid ${s.isActive ? '#c4f060' : '#fca5a5'}`,
                                borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 600,
                              }}>
                                {s.isActive ? 'Active' : 'Not Moving Forward'}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px', color: '#9a9490', whiteSpace: 'nowrap' }}>
                              {new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    )
  }

  // ─── Submit ───
  return (
    <div style={{ minHeight: '100vh', background: '#F5F0EB', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
      <BrandHeader />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 16px 60px' }}>
        <button
          onClick={backToList}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6560', fontSize: 13, fontWeight: 500, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontFamily: 'Arial, "Open Sans", sans-serif' }}
        >
          ← Back to positions
        </button>

        {/* Position hero */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '28px 36px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9a9490', marginBottom: 8 }}>Submit Candidate</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#2F2C29', marginBottom: 6 }}>{selectedPosition?.title}</h1>
          <div style={{ height: 3, width: 36, background: '#8CF000', borderRadius: 2 }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '32px 36px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#2F2C29', marginBottom: 20 }}>Candidate Details</h2>

            {/* CV */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2F2C29', marginBottom: 6 }}>
                CV / Resume <span style={{ color: '#8CF000' }}>*</span>
                <span style={{ color: '#9a9490', fontWeight: 400, marginLeft: 6 }}>(PDF)</span>
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setCvDragOver(true) }}
                onDragLeave={() => setCvDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setCvDragOver(false)
                  const dropped = e.dataTransfer.files[0]
                  if (dropped) handleFileChange({ target: { files: e.dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>)
                }}
                style={{
                  border: `2px dashed ${file || cvDragOver ? '#8CF000' : '#d5d0ca'}`,
                  borderRadius: 12,
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: file || cvDragOver ? '#f9ffe6' : '#fafaf8',
                  transition: 'all 0.15s',
                }}
              >
                {file ? (
                  <p style={{ fontSize: 14, color: '#3a6600', fontWeight: 500 }}>📄 {file.name}</p>
                ) : (
                  <>
                    <p style={{ fontSize: 14, color: '#9a9490' }}>Drag &amp; drop your CV here, or <span style={{ color: '#2F2C29', fontWeight: 600 }}>Browse</span></p>
                    <p style={{ fontSize: 12, color: '#b5b0aa', marginTop: 4 }}>PDF only</p>
                  </>
                )}
                {parsing && <p style={{ fontSize: 12, color: '#5a8a00', marginTop: 6 }}>Parsing CV…</p>}
                {file && !parsing && <p style={{ fontSize: 12, color: '#5a8a00', marginTop: 6 }}>CV ready — please review the fields below.</p>}
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFileChange} required />
            </div>

            {/* Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <InputField label="First Name" required>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
              <InputField label="Last Name" required>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <InputField label="Email" required>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
            </div>

            {/* Country */}
            <div style={{ marginBottom: 14 }}>
              <InputField label="Country" required>
                <select value={country} onChange={(e) => setCountry(e.target.value)} required style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                >
                  <option value="">— Select country —</option>
                  {LATAM_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </InputField>
            </div>

            {/* Compensation */}
            <div style={{ marginBottom: 8 }}>
              <InputField label="Monthly Rate (USD)" required>
                <input
                  type="number" min={0} step="1" value={desiredCompensation}
                  onChange={(e) => setDesiredCompensation(e.target.value)}
                  required placeholder="e.g. 3500" style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#8CF000'; e.target.style.boxShadow = '0 0 0 3px rgba(140,240,0,0.15)' }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e0da'; e.target.style.boxShadow = 'none' }}
                />
              </InputField>
            </div>

            {submitError && <p style={{ color: '#e53e3e', fontSize: 13, marginTop: 8 }}>{submitError}</p>}

            {/* Availability slots */}
            <div style={{ marginTop: 24, borderTop: '1px solid #f0ebe5', paddingTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: '#2F2C29' }}>Availability <span style={{ color: '#e53e3e' }}>*</span></h2>
                {selectedPosition && (
                  <span style={{ fontSize: 11, color: '#9a9490' }}>All times in {tzAbbr(selectedPosition.timezone)}</span>
                )}
              </div>
              <p style={{ fontSize: 12, color: '#9a9490', marginBottom: 14 }}>Share up to 5 time slots when you&apos;re available for an interview. This helps us schedule faster.</p>
              {availabilitySlots.map((slot, i) => {
                const past = isSlotInPast(slot.date, slot.time)
                return (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="date"
                        value={slot.date}
                        onChange={(e) => updateSlot(i, 'date', e.target.value)}
                        style={{ ...inputStyle, flex: 1, borderColor: past ? '#fca5a5' : '#e5e0da' }}
                      />
                      <select
                        value={slot.time}
                        onChange={(e) => updateSlot(i, 'time', e.target.value)}
                        style={{ ...inputStyle, width: 130, cursor: 'pointer', borderColor: past ? '#fca5a5' : '#e5e0da' }}
                      >
                        {TIME_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeSlot(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a9490', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
                    </div>
                    {past && (
                      <p style={{ fontSize: 11, color: '#dc2626', marginTop: 3, marginLeft: 2 }}>Please select a future date and time.</p>
                    )}
                  </div>
                )
              })}
              {availabilitySlots.length < 5 && (
                <button type="button" onClick={addSlot} style={{ background: 'none', border: '1.5px dashed #d5d0ca', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: '#6b6560', cursor: 'pointer', fontFamily: 'Arial, "Open Sans", sans-serif' }}>
                  + Add time slot
                </button>
              )}
            </div>

            {/* Consent checkbox */}
            <div style={{ marginTop: 20, borderTop: '1px solid #f0ebe5', paddingTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => { setConsentChecked(e.target.checked); if (e.target.checked) setConsentError(false) }}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: '#8CF000', flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12, color: consentError ? '#e53e3e' : '#6b6560', lineHeight: 1.5, fontFamily: 'Arial, "Open Sans", sans-serif' }}>
                  I confirm that this candidate has given their consent to share their personal data with Tenarai LATAM for recruitment evaluation purposes.
                  <span style={{ color: '#8CF000', marginLeft: 3 }}>*</span>
                </span>
              </label>
              {consentError && (
                <p style={{ color: '#e53e3e', fontSize: 12, marginTop: 4, marginLeft: 26 }}>You must confirm candidate consent to continue.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || parsing || !file}
              style={{
                width: '100%',
                marginTop: 24,
                background: submitting || parsing || !file ? '#d5d0ca' : '#8CF000',
                color: submitting || parsing || !file ? '#9a9490' : '#000',
                border: 'none',
                borderRadius: 12,
                padding: '14px 24px',
                fontSize: 15,
                fontWeight: 700,
                cursor: submitting || parsing || !file ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                fontFamily: 'Arial, "Open Sans", sans-serif',
              }}
              onMouseEnter={(e) => { if (!submitting && !parsing && file) (e.target as HTMLButtonElement).style.background = '#7ada00' }}
              onMouseLeave={(e) => { if (!submitting && !parsing && file) (e.target as HTMLButtonElement).style.background = '#8CF000' }}
            >
              {submitting ? 'Submitting…' : 'Submit Candidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
