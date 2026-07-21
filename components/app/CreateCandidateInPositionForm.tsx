'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { NewCandidatePosition } from './LinkedInImportFlow'

const LATAM_COUNTRIES = [
  'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador',
  'Mexico', 'Paraguay', 'Peru', 'Uruguay', 'Venezuela', 'Other',
]

interface UserOption { id: string; name: string | null; email?: string }
interface VendorOption { id: string; name: string }

interface ParsedCV {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  country?: string | null
  seniority?: string | null
  yearsOfExperience?: number | null
  skills?: string[]
  languages?: string[]
  summary?: string | null
}

interface Props {
  positionId: string
  currentUserId?: string
  onCreated: (newRow: NewCandidatePosition) => void
  onCancel: () => void
}

export function CreateCandidateInPositionForm({ positionId, currentUserId, onCreated, onCancel }: Props) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('')
  const [recruiterId, setRecruiterId] = useState(currentUserId ?? '')
  const [sourcedByType, setSourcedByType] = useState<'RECRUITER' | 'VENDOR' | 'OTHER' | ''>('')
  const [sourcedByUserId, setSourcedByUserId] = useState('')
  const [sourcedByVendorId, setSourcedByVendorId] = useState('')
  const [sourcedByOther, setSourcedByOther] = useState('')

  const [users, setUsers] = useState<UserOption[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])

  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvParsing, setCvParsing] = useState(false)
  const [cvParsed, setCvParsed] = useState<ParsedCV | null>(null)
  const [cvDriveId, setCvDriveId] = useState('')
  const [cvOriginalName, setCvOriginalName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/users/options').then((r) => r.json()).then((data: UserOption[]) => setUsers(data)).catch(() => {})
    fetch('/api/vendors?active=true').then((r) => r.json()).then((data: VendorOption[]) => setVendors(data)).catch(() => {})
  }, [])

  async function handleCvChange(file: File) {
    setCvFile(file)
    setCvParsed(null)
    setCvParsing(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/cv/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'CV parse failed'); return }
      const { parsed, driveFileId, driveFileName } = data
      setCvParsed(parsed)
      setCvDriveId(driveFileId ?? '')
      setCvOriginalName(driveFileName ?? file.name)
      // Pre-fill empty fields from parsed CV
      if (parsed.firstName && !firstName) setFirstName(parsed.firstName)
      if (parsed.lastName && !lastName) setLastName(parsed.lastName)
      if (parsed.email && !email) setEmail(parsed.email)
      if (parsed.country && !country) setCountry(parsed.country)
    } catch {
      setError('Failed to parse CV — you can still submit without it.')
    } finally {
      setCvParsing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    // 1. Create candidate
    const candidatePayload: Record<string, unknown> = {
      firstName,
      lastName,
      email,
      country: country || null,
      recruiterId: recruiterId || null,
      sourcedByType: sourcedByType || null,
      sourcedByUserId: sourcedByType === 'RECRUITER' ? sourcedByUserId || null : null,
      sourcedByVendorId: sourcedByType === 'VENDOR' ? sourcedByVendorId || null : null,
      sourcedByOther: sourcedByType === 'OTHER' ? sourcedByOther || null : null,
      skills: cvParsed?.skills ?? [],
      languages: cvParsed?.languages ?? [],
      ...(cvDriveId ? { cvDriveId, cvOriginalName } : {}),
      ...(cvParsed?.phone ? { phone: cvParsed.phone } : {}),
      ...(cvParsed?.seniority ? { seniority: cvParsed.seniority } : {}),
      ...(cvParsed?.yearsOfExperience != null ? { yearsOfExperience: cvParsed.yearsOfExperience } : {}),
      ...(cvParsed?.summary ? { notes: cvParsed.summary } : {}),
    }

    const candidateRes = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidatePayload),
    })

    if (!candidateRes.ok) {
      const data = await candidateRes.json()
      const msg = data.error?.fieldErrors
        ? Object.values(data.error.fieldErrors as Record<string, string[]>).flat()[0]
        : typeof data.error === 'string' ? data.error : 'Failed to create candidate.'
      setError(msg)
      setSubmitting(false)
      return
    }

    const candidate = await candidateRes.json()

    // 2. Link to position
    const cpRes = await fetch('/api/candidate-positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candidate.id, positionId, recruiterId: recruiterId || null }),
    })

    if (!cpRes.ok) {
      const data = await cpRes.json()
      setError(data.error ?? 'Candidate created but could not be linked to this position.')
      setSubmitting(false)
      return
    }

    const cp = await cpRes.json()
    setSubmitting(false)
    onCreated({
      id: cp.id,
      stage: 'APPLIED',
      status: 'ACTIVE',
      fitScore: null,
      createdAt: cp.createdAt ?? new Date().toISOString(),
      candidate: {
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        country: candidate.country ?? null,
        seniority: candidate.seniority ?? null,
      },
    })
  }

  const inputClass = 'mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000] focus:border-transparent'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cn-firstName">First Name *</Label>
          <Input id="cn-firstName" className="mt-1" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cn-lastName">Last Name *</Label>
          <Input id="cn-lastName" className="mt-1" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cn-email">Email *</Label>
          <Input id="cn-email" className="mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cn-country">Country</Label>
          <Select id="cn-country" className="mt-1" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">— Select country —</option>
            {LATAM_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
      </div>

      {/* CV Upload */}
      <div>
        <Label>CV (optional PDF)</Label>
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleCvChange(f)
              else { setCvFile(null); setCvParsed(null) }
            }}
            className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
          />
          {cvParsing && <span className="text-xs text-gray-400 italic">Parsing CV…</span>}
        </div>
        {cvParsed && !cvParsing && (
          <p className="mt-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            CV parsed — fields pre-filled where empty.
          </p>
        )}
      </div>

      {/* Recruiter */}
      <div>
        <Label htmlFor="cn-recruiter">Recruiter *</Label>
        <Select id="cn-recruiter" className="mt-1" required value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)}>
          <option value="">— Select recruiter —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
        </Select>
      </div>

      {/* Sourced By */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cn-sourcedBy">Sourced By</Label>
          <Select
            id="cn-sourcedBy"
            className="mt-1"
            value={sourcedByType}
            onChange={(e) => setSourcedByType(e.target.value as typeof sourcedByType)}
          >
            <option value="">— Not specified —</option>
            <option value="RECRUITER">Internal Recruiter</option>
            <option value="VENDOR">Partner</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>

        {sourcedByType === 'RECRUITER' && (
          <div>
            <Label htmlFor="cn-sourcedUser">Recruiter</Label>
            <Select id="cn-sourcedUser" className="mt-1" value={sourcedByUserId} onChange={(e) => setSourcedByUserId(e.target.value)}>
              <option value="">— Select —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
            </Select>
          </div>
        )}
        {sourcedByType === 'VENDOR' && (
          <div>
            <Label htmlFor="cn-sourcedVendor">Partner</Label>
            <Select id="cn-sourcedVendor" className="mt-1" value={sourcedByVendorId} onChange={(e) => setSourcedByVendorId(e.target.value)}>
              <option value="">— Select —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
        )}
        {sourcedByType === 'OTHER' && (
          <div>
            <Label htmlFor="cn-sourcedOther">Source Details</Label>
            <Input id="cn-sourcedOther" className="mt-1" value={sourcedByOther} onChange={(e) => setSourcedByOther(e.target.value)} placeholder="e.g. Referral, Job board" />
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2 border-t border-gray-100">
        <Button type="submit" disabled={submitting || cvParsing}>
          {submitting ? 'Creating…' : 'Create & Add to Position'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
