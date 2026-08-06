'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

interface Position {
  id: string
  title: string
  client: string
  jdSummary: string | null
  location: string[]
}

interface PortalData {
  vendorName: string
  positions: Position[]
}

interface CheckItem {
  name: string
  passed: boolean
  detail: string
}

const COUNTRIES = [
  'Argentina','Bolivia','Brazil','Chile','Colombia','Costa Rica','Cuba','Dominican Republic',
  'Ecuador','El Salvador','Guatemala','Honduras','Mexico','Nicaragua','Panama','Paraguay',
  'Peru','Puerto Rico','Uruguay','Venezuela','United States','Canada','Spain','Portugal','Other',
]

export default function ReferralPortalPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PortalData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)

  // Form state
  const [referrerName, setReferrerName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [note, setNote] = useState('')
  const [cvFile, setCvFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<{ rejected: boolean; message: string; checks?: CheckItem[] } | null>(null)

  useEffect(() => {
    fetch(`/api/refer/${token}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null }
        return r.json()
      })
      .then((d) => { if (d) setData(d) })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPosition) { setSubmitError('Please select a position.'); return }
    if (!cvFile) { setSubmitError('Please upload the candidate\'s CV (PDF).'); return }

    setSubmitting(true)
    setSubmitError('')

    const fd = new FormData()
    fd.append('positionId', selectedPosition.id)
    fd.append('referrerName', referrerName)
    fd.append('firstName', firstName)
    fd.append('lastName', lastName)
    fd.append('email', email)
    fd.append('phone', phone)
    fd.append('country', country)
    fd.append('linkedinUrl', linkedinUrl)
    fd.append('note', note)
    fd.append('cv', cvFile)

    try {
      const res = await fetch(`/api/refer/${token}/submit`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error ?? 'Something went wrong.')
      } else {
        setResult(data)
      }
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-md text-center">
          <p className="text-gray-500">This referral link is invalid or no longer active.</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-4">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-lg w-full">
          <div className="text-center mb-6">
            {result.rejected ? (
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 mb-4">
                <span className="text-2xl">✗</span>
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#E8F7CC] mb-4">
                <span className="text-2xl">✓</span>
              </div>
            )}
            <h2 className="text-xl font-semibold text-gray-900">
              {result.rejected ? 'Referral Not Accepted' : 'Referral Submitted!'}
            </h2>
            <p className="text-gray-500 text-sm mt-2">{result.message}</p>
          </div>
          {result.checks && (
            <div className="space-y-2 mt-4">
              {result.checks.map((c) => (
                <div key={c.name} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <span className={`mt-0.5 text-sm font-bold ${c.passed ? 'text-green-600' : 'text-red-500'}`}>
                    {c.passed ? '✓' : '✗'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Refer a Candidate</h1>
          <p className="text-sm text-gray-500 mt-1">
            Referral network: <span className="font-medium text-gray-700">{data.vendorName}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-8">
          {/* Position selector */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Open Position <span className="text-[#8CF000]">*</span>
            </h2>
            {data.positions.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No open positions available at this time.</p>
            ) : (
              <div className="space-y-3">
                {data.positions.map((pos) => (
                  <label
                    key={pos.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                      selectedPosition?.id === pos.id
                        ? 'border-[#8DF000] bg-[#F5FBE8]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="position"
                      value={pos.id}
                      checked={selectedPosition?.id === pos.id}
                      onChange={() => setSelectedPosition(pos)}
                      className="mt-1 accent-[#8DF000]"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{pos.title}</p>
                      <p className="text-xs text-gray-500">{pos.client}</p>
                      {pos.location.length > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">📍 {pos.location.join(', ')}</p>
                      )}
                      {pos.jdSummary && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{pos.jdSummary}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Referrer info */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Your Information <span className="text-[#8CF000]">*</span>
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
              <input
                required
                type="text"
                value={referrerName}
                onChange={(e) => setReferrerName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
              />
            </div>
          </div>

          {/* Candidate info */}
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Candidate Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  required
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  required
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                <select
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
                >
                  <option value="">Select country…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">CV / Resume *</label>
                <div
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    cvFile ? 'border-[#8DF000] bg-[#F5FBE8]' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => fileRef.current?.click()}
                >
                  {cvFile ? (
                    <p className="text-sm font-medium text-gray-800">{cvFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">Click to upload PDF</p>
                      <p className="text-xs text-gray-400 mt-1">PDF only, max 10MB</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why are you referring this candidate? Any context that may help…"
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000] resize-none"
                />
              </div>
            </div>
          </div>

          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || data.positions.length === 0}
            className="w-full py-3 px-6 rounded-xl font-medium text-sm bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting…' : 'Submit Referral'}
          </button>
        </form>
      </div>
    </div>
  )
}
