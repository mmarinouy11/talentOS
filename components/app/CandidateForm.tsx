'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { TagInput } from './TagInput'
import { CVUpload, type ParsedCV } from './CVUpload'
import { CandidateCVUpdate } from './CandidateCVUpdate'
import type { Seniority } from '@prisma/client'

const LATAM_COUNTRIES = [
  'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador',
  'Mexico', 'Paraguay', 'Peru', 'Uruguay', 'Venezuela', 'Other',
]

interface Fields {
  firstName: string
  lastName: string
  email: string
  phone: string
  country: string
  linkedinUrl: string
  seniority: Seniority | ''
  yearsOfExperience: string
  desiredCompensation: string
  minimumCompensation: string
  notes: string
  recruiterId: string
  sourcedByType: 'RECRUITER' | 'VENDOR' | 'OTHER' | ''
  sourcedByUserId: string
  sourcedByVendorId: string
  sourcedByOther: string
}

interface CandidateFormProps {
  mode: 'create' | 'edit'
  currentUserId?: string
  defaultValues?: {
    id?: string
    firstName?: string
    lastName?: string
    email?: string
    phone?: string | null
    country?: string | null
    linkedinUrl?: string | null
    seniority?: Seniority | null
    yearsOfExperience?: number | null
    desiredCompensation?: number | null
    minimumCompensation?: number | null
    skills?: string[]
    languages?: string[]
    notes?: string | null
    cvDriveId?: string | null
    cvOriginalName?: string | null
    recruiterId?: string | null
    sourcedByType?: 'RECRUITER' | 'VENDOR' | 'OTHER' | null
    sourcedByUserId?: string | null
    sourcedByVendorId?: string | null
    sourcedByOther?: string | null
  }
}

interface UserOption { id: string; name: string | null; email: string }
interface VendorOption { id: string; name: string }

export function CandidateForm({ mode, currentUserId, defaultValues = {} }: CandidateFormProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [skills, setSkills] = useState<string[]>(defaultValues.skills ?? [])
  const [languages, setLanguages] = useState<string[]>(defaultValues.languages ?? [])
  const [cvDriveId, setCvDriveId] = useState(defaultValues.cvDriveId ?? '')
  const [cvOriginalName, setCvOriginalName] = useState(defaultValues.cvOriginalName ?? '')
  const [cvBanner, setCvBanner] = useState(false)
  const [cvExperience, setCvExperience] = useState<ParsedCV['experience']>(undefined)
  const [cvEducation, setCvEducation] = useState<ParsedCV['education']>(undefined)
  const [parsedSummary, setParsedSummary] = useState<string | null>(null)
  const [minimumManuallyEdited, setMinimumManuallyEdited] = useState(
    defaultValues.minimumCompensation != null && defaultValues.minimumCompensation !== defaultValues.desiredCompensation
  )
  const [users, setUsers] = useState<UserOption[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])

  const [fields, setFields] = useState<Fields>({
    firstName: defaultValues.firstName ?? '',
    lastName: defaultValues.lastName ?? '',
    email: defaultValues.email ?? '',
    phone: defaultValues.phone ?? '',
    country: defaultValues.country ?? '',
    linkedinUrl: defaultValues.linkedinUrl ?? '',
    seniority: defaultValues.seniority ?? '',
    yearsOfExperience: defaultValues.yearsOfExperience?.toString() ?? '',
    desiredCompensation: defaultValues.desiredCompensation?.toString() ?? '',
    minimumCompensation: defaultValues.minimumCompensation?.toString() ?? '',
    notes: defaultValues.notes ?? '',
    recruiterId: defaultValues.recruiterId ?? currentUserId ?? '',
    sourcedByType: defaultValues.sourcedByType ?? '',
    sourcedByUserId: defaultValues.sourcedByUserId ?? '',
    sourcedByVendorId: defaultValues.sourcedByVendorId ?? '',
    sourcedByOther: defaultValues.sourcedByOther ?? '',
  })

  useEffect(() => {
    fetch('/api/users/options').then((r) => r.json()).then(setUsers).catch(() => {})
    fetch('/api/vendors?active=true').then((r) => r.json()).then(setVendors).catch(() => {})
  }, [])

  function setField<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function handleReparsed(reparsed: {
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    country?: string | null
    seniority?: import('@prisma/client').Seniority | null
    yearsOfExperience?: number | null
    skills?: string[]
    languages?: string[]
    summary?: string | null
    cvOriginalName?: string | null
    cvDriveId?: string | null
  }) {
    if (reparsed.cvDriveId) setCvDriveId(reparsed.cvDriveId)
    if (reparsed.cvOriginalName) setCvOriginalName(reparsed.cvOriginalName)
    setFields((prev) => ({
      ...prev,
      ...(reparsed.firstName != null ? { firstName: reparsed.firstName } : {}),
      ...(reparsed.lastName != null ? { lastName: reparsed.lastName } : {}),
      ...(reparsed.phone !== undefined ? { phone: reparsed.phone ?? '' } : {}),
      ...(reparsed.country !== undefined ? { country: reparsed.country ?? '' } : {}),
      ...(reparsed.seniority !== undefined ? { seniority: reparsed.seniority ?? '' } : {}),
      ...(reparsed.yearsOfExperience !== undefined ? { yearsOfExperience: reparsed.yearsOfExperience?.toString() ?? '' } : {}),
      ...(reparsed.summary != null ? { notes: reparsed.summary } : {}),
    }))
    if (reparsed.skills?.length) setSkills(reparsed.skills)
    if (reparsed.languages?.length) setLanguages(reparsed.languages)
  }

  function handleParsed(parsed: ParsedCV, fileId: string, fileName: string) {
    setCvDriveId(fileId)
    setCvOriginalName(fileName)
    setCvBanner(true)
    setFields((prev) => ({
      ...prev,
      firstName: parsed.firstName ?? '',
      lastName: parsed.lastName ?? '',
      email: parsed.email ?? '',
      phone: parsed.phone ?? '',
      country: parsed.country ?? '',
      linkedinUrl: parsed.linkedinUrl ?? '',
      seniority: (parsed.seniority ?? '') as Seniority | '',
      yearsOfExperience: parsed.yearsOfExperience?.toString() ?? '',
      desiredCompensation: '',
      minimumCompensation: '',
      notes: parsed.summary ?? '',
    }))
    if (parsed.skills.length) setSkills(parsed.skills)
    if (parsed.languages.length) setLanguages(parsed.languages)
    if (parsed.experience?.length) setCvExperience(parsed.experience)
    if (parsed.education?.length) setCvEducation(parsed.education)
    setParsedSummary(parsed.summary ?? null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const payload: Record<string, unknown> = {
      firstName: fields.firstName,
      lastName: fields.lastName,
      email: fields.email,
      phone: fields.phone || null,
      country: fields.country || null,
      linkedinUrl: fields.linkedinUrl || null,
      seniority: fields.seniority || undefined,
      yearsOfExperience: fields.yearsOfExperience ? parseInt(fields.yearsOfExperience, 10) : null,
      desiredCompensation: fields.desiredCompensation ? parseFloat(fields.desiredCompensation) : null,
      minimumCompensation: fields.minimumCompensation ? parseFloat(fields.minimumCompensation) : null,
      skills,
      languages,
      notes: fields.notes || null,
      cvDriveId: cvDriveId || undefined,
      cvOriginalName: cvOriginalName || undefined,
      summary: parsedSummary,
      cvExperience: cvExperience ?? undefined,
      cvEducation: cvEducation ?? undefined,
      recruiterId: fields.recruiterId || null,
      sourcedByType: fields.sourcedByType || null,
      sourcedByUserId: fields.sourcedByType === 'RECRUITER' ? fields.sourcedByUserId || null : null,
      sourcedByVendorId: fields.sourcedByType === 'VENDOR' ? fields.sourcedByVendorId || null : null,
      sourcedByOther: fields.sourcedByType === 'OTHER' ? fields.sourcedByOther || null : null,
    }

    const url = mode === 'edit' ? `/api/candidates/${defaultValues.id}` : '/api/candidates'
    const method = mode === 'edit' ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      const msg =
        data.error?.fieldErrors
          ? Object.values(data.error.fieldErrors as Record<string, string[]>).flat()[0]
          : typeof data.error === 'string'
          ? data.error
          : 'Something went wrong.'
      setError(msg)
      return
    }

    const created = await res.json()
    router.push(`/candidates/${created.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {mode === 'create' && (
          <div className="col-span-2">
            <Label>Upload CV (optional)</Label>
            <CVUpload onParsed={handleParsed} className="mt-1" />
            {cvBanner && (
              <p className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                CV parsed successfully — fields have been pre-filled. Please review before saving.
              </p>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            required
            value={fields.firstName}
            onChange={(e) => setField('firstName', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            required
            value={fields.lastName}
            onChange={(e) => setField('lastName', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            required
            value={fields.email}
            onChange={(e) => setField('email', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={fields.phone}
            onChange={(e) => setField('phone', e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div>
          <Label htmlFor="country">Country</Label>
          <Select
            id="country"
            value={fields.country}
            onChange={(e) => setField('country', e.target.value)}
          >
            <option value="">— Select country —</option>
            {LATAM_COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
          <Input
            id="linkedinUrl"
            type="url"
            value={fields.linkedinUrl}
            onChange={(e) => setField('linkedinUrl', e.target.value)}
            placeholder="https://linkedin.com/in/…"
          />
        </div>

        <div>
          <Label htmlFor="seniority">Seniority</Label>
          <Select
            id="seniority"
            value={fields.seniority}
            onChange={(e) => setField('seniority', e.target.value as Seniority | '')}
          >
            <option value="">— Select seniority —</option>
            {(['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL'] as Seniority[]).map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="yearsOfExperience">Years of Experience</Label>
          <Input
            id="yearsOfExperience"
            type="number"
            min={0}
            value={fields.yearsOfExperience}
            onChange={(e) => setField('yearsOfExperience', e.target.value)}
            placeholder="Optional"
          />
        </div>

        {/* Compensation */}
        <div className="col-span-2 border-t border-gray-100 pt-4 mt-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Compensation Expectation</p>
        </div>

        <div>
          <Label htmlFor="desiredCompensation">Desired Compensation ($/mo, CTC)</Label>
          <Input
            id="desiredCompensation"
            type="number"
            min={0}
            step="1"
            value={fields.desiredCompensation}
            onChange={(e) => {
              setField('desiredCompensation', e.target.value)
              if (!minimumManuallyEdited) setField('minimumCompensation', e.target.value)
            }}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="minimumCompensation">Minimum Acceptable Compensation ($/mo, CTC)</Label>
          <Input
            id="minimumCompensation"
            type="number"
            min={0}
            step="1"
            value={fields.minimumCompensation}
            onChange={(e) => {
              setMinimumManuallyEdited(true)
              setField('minimumCompensation', e.target.value)
            }}
            placeholder="Optional"
          />
          {!minimumManuallyEdited && fields.minimumCompensation !== '' && (
            <p className="text-xs text-gray-400 mt-1">Auto-filled from Desired — you can adjust it</p>
          )}
        </div>

        {/* Recruiter */}
        <div className="col-span-2 border-t border-gray-100 pt-4 mt-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Ownership</p>
        </div>

        <div className="col-span-2">
          <Label htmlFor="recruiterId">Recruiter (Internal Owner) <span className="text-red-500">*</span></Label>
          <Select
            id="recruiterId"
            value={fields.recruiterId}
            onChange={(e) => setField('recruiterId', e.target.value)}
            required
          >
            <option value="">— Select recruiter —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </Select>
        </div>

        {/* Sourcing */}
        <div className="col-span-2 border-t border-gray-100 pt-4 mt-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Sourcing</p>
        </div>

        <div>
          <Label htmlFor="sourcedByType">Sourced By</Label>
          <Select
            id="sourcedByType"
            value={fields.sourcedByType}
            onChange={(e) => setField('sourcedByType', e.target.value as Fields['sourcedByType'])}
          >
            <option value="">— Not specified —</option>
            <option value="RECRUITER">Internal Recruiter</option>
            <option value="VENDOR">Partner</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>

        {fields.sourcedByType === 'RECRUITER' && (
          <div>
            <Label htmlFor="sourcedByUserId">Recruiter</Label>
            <Select
              id="sourcedByUserId"
              value={fields.sourcedByUserId}
              onChange={(e) => setField('sourcedByUserId', e.target.value)}
            >
              <option value="">— Select recruiter —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </Select>
          </div>
        )}

        {fields.sourcedByType === 'VENDOR' && (
          <div>
            <Label htmlFor="sourcedByVendorId">Partner</Label>
            <Select
              id="sourcedByVendorId"
              value={fields.sourcedByVendorId}
              onChange={(e) => setField('sourcedByVendorId', e.target.value)}
            >
              <option value="">— Select partner —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </div>
        )}

        {fields.sourcedByType === 'OTHER' && (
          <div>
            <Label htmlFor="sourcedByOther">Source Details</Label>
            <Input
              id="sourcedByOther"
              value={fields.sourcedByOther}
              onChange={(e) => setField('sourcedByOther', e.target.value)}
              placeholder="e.g. Referral, Job board, Conference"
            />
          </div>
        )}

        {/* Skills & Languages */}
        <div className="col-span-2 border-t border-gray-100 pt-4 mt-2">
          <Label>Skills</Label>
          <TagInput value={skills} onChange={setSkills} placeholder="Type a skill and press Enter…" />
        </div>

        <div className="col-span-2">
          <Label>Languages</Label>
          <TagInput value={languages} onChange={setLanguages} placeholder="Type a language and press Enter…" />
        </div>

        <div className="col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={fields.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Any additional notes…"
            className="min-h-[100px]"
          />
        </div>

        {mode === 'edit' && defaultValues.id && (
          <CandidateCVUpdate
            candidateId={defaultValues.id}
            currentCvOriginalName={cvOriginalName || null}
            currentCvDriveId={cvDriveId || null}
            onReparsed={handleReparsed}
          />
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Candidate'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
