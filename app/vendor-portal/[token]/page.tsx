'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

const LATAM_COUNTRIES = [
  'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador',
  'Mexico', 'Paraguay', 'Peru', 'Uruguay', 'Venezuela', 'Other',
]

interface Position {
  id: string
  title: string
  client: string
  status: string
}

interface VendorData {
  vendorId: string
  vendorName: string
  positions: Position[]
}

type PageState = 'loading' | 'invalid' | 'list' | 'submit' | 'success' | 'rejected'
type RejectionReason = 'duplicate' | 'low_score' | 'over_budget'

const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function VendorPortalPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>('loading')
  const [data, setData] = useState<VendorData | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)

  // Submission form state
  const [file, setFile] = useState<File | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('')
  const [desiredCompensation, setDesiredCompensation] = useState('')
  const [parsing, setParsing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [rejectionReason, setRejectionReason] = useState<RejectionReason | null>(null)
  const [rejectionMessage, setRejectionMessage] = useState('')
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
      // non-fatal — user can fill in manually
    } finally {
      setParsing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPosition || !file) return
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
      const res = await fetch(`/api/vendor-portal/${token}/submit`, { method: 'POST', body: fd })
      const d = await res.json()
      if (d.rejected) {
        setRejectionReason(d.reason as RejectionReason)
        setRejectionMessage(d.message)
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
    setState('submit')
  }

  function backToList() {
    setState('list')
    setSelectedPosition(null)
  }

  function submitAnother() {
    setState('list')
    setSelectedPosition(null)
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (state === 'invalid' || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid link</h1>
          <p className="text-gray-600">This link is invalid. Please contact your TalentOS contact for a valid link.</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Candidate submitted!</h1>
          <p className="text-gray-600 mb-6">The candidate has been successfully added to the pipeline. Our team will review and be in touch.</p>
          <button onClick={submitAnother} className="bg-black text-white font-medium py-2 px-6 rounded-xl hover:bg-gray-800 transition-colors">
            Submit another candidate
          </button>
        </div>
      </div>
    )
  }

  if (state === 'rejected') {
    const heading =
      rejectionReason === 'duplicate' ? 'Candidate already submitted' :
      rejectionReason === 'over_budget' ? 'Candidate not suitable for this position' :
      'Candidate does not meet requirements'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{heading}</h1>
          <p className="text-gray-600 mb-6">{rejectionMessage}</p>
          <button onClick={submitAnother} className="bg-black text-white font-medium py-2 px-6 rounded-xl hover:bg-gray-800 transition-colors">
            Try a different candidate
          </button>
        </div>
      </div>
    )
  }

  const openPositions = data.positions.filter((p) => p.status === 'OPEN')

  if (state === 'list') {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <p className="text-sm text-gray-500 uppercase tracking-wide font-medium mb-1">Vendor Portal</p>
            <h1 className="text-2xl font-bold text-gray-900">{data.vendorName}</h1>
            <p className="text-gray-600 mt-1">Submit candidates for open positions below.</p>
          </div>

          {openPositions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500">No open positions are currently assigned to you. Check back later or contact your TalentOS contact.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {openPositions.map((pos) => (
                <div key={pos.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{pos.title}</h2>
                    <p className="text-sm text-gray-500">{pos.client}</p>
                  </div>
                  <button
                    onClick={() => startSubmit(pos)}
                    className="bg-black text-white font-medium py-2 px-4 rounded-lg text-sm hover:bg-gray-800 transition-colors"
                  >
                    Submit a Candidate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // submit state
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={backToList} className="text-sm text-gray-500 hover:text-gray-900 mb-6 flex items-center gap-1">
          ← Back to positions
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-6">
            <p className="text-sm text-gray-500 uppercase tracking-wide font-medium mb-1">Submit Candidate</p>
            <h1 className="text-xl font-bold text-gray-900">{selectedPosition?.title}</h1>
            <p className="text-gray-600">{selectedPosition?.client}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* CV upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CV / Resume (PDF) *</label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                required
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              />
              {parsing && <p className="text-xs text-blue-600 mt-1">Parsing CV…</p>}
              {file && !parsing && <p className="text-xs text-green-600 mt-1">CV ready — please review the fields below before submitting.</p>}
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputClass} />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
            </div>

            {/* Country */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} required className={inputClass}>
                <option value="">— Select country —</option>
                {LATAM_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Desired Compensation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expected Monthly Compensation (USD) *
              </label>
              <input
                type="number"
                min={0}
                step="1"
                value={desiredCompensation}
                onChange={(e) => setDesiredCompensation(e.target.value)}
                required
                placeholder="e.g. 3500"
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1">Gross monthly amount in USD that the candidate expects to earn.</p>
            </div>

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <button
              type="submit"
              disabled={submitting || parsing || !file}
              className="w-full bg-black hover:bg-gray-800 disabled:bg-gray-300 text-white font-medium py-3 px-6 rounded-xl transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Candidate'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
