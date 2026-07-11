'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import type { Role, Priority, PositionStatus } from '@prisma/client'

export interface UserOption {
  id: string
  name: string | null
  email: string
  role: Role
}

const LATAM_LOCATIONS = [
  'Anywhere LATAM',
  'Argentina',
  'Uruguay',
  'Chile',
  'Colombia',
  'Mexico',
  'Peru',
  'Brazil',
  'Bolivia',
  'Paraguay',
  'Ecuador',
  'Venezuela',
]

const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-blue-600',
  HIGH: 'text-orange-600',
  URGENT: 'text-red-600',
}

const REPORTING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const
const REPORTING_DAY_LABELS: Record<string, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri' }

interface PositionFormProps {
  users: UserOption[]
  defaultValues?: {
    id?: string
    title?: string
    client?: string
    description?: string
    status?: PositionStatus
    priority?: Priority
    target_date_asap?: boolean
    target_date?: string | null
    location?: string[]
    recruiterId?: string
    hiring_manager_name?: string | null
    hiring_manager_email?: string | null
    sales_contact_email?: string | null
    clientRate?: number | null
    internalCostBudget?: number | null
    vendorMinFitScore?: number | null
    directMinFitScore?: number | null
    talentId?: string | null
    reportingEmails?: string[]
    reportingDays?: string[]
  }
  mode: 'create' | 'edit'
}

export function PositionForm({ users, defaultValues = {}, mode }: PositionFormProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isAsap, setIsAsap] = useState(defaultValues.target_date_asap ?? false)
  const [locations, setLocations] = useState<string[]>(defaultValues.location ?? [])
  const [clientRate, setClientRate] = useState<string>(
    defaultValues.clientRate != null ? String(defaultValues.clientRate) : ''
  )
  const [internalCostBudget, setInternalCostBudget] = useState<string>(
    defaultValues.internalCostBudget != null ? String(defaultValues.internalCostBudget) : ''
  )
  const [vendorMinFitScore, setVendorMinFitScore] = useState<string>(
    defaultValues.vendorMinFitScore != null ? String(defaultValues.vendorMinFitScore) : ''
  )
  const [directMinFitScore, setDirectMinFitScore] = useState<string>(
    defaultValues.directMinFitScore != null ? String(defaultValues.directMinFitScore) : ''
  )
  const [globalVendorThreshold, setGlobalVendorThreshold] = useState<number>(70)
  const [globalDirectThreshold, setGlobalDirectThreshold] = useState<number>(30)
  const [dgmThreshold, setDgmThreshold] = useState<number>(0.4)
  const [reportingEmails, setReportingEmails] = useState<string[]>(defaultValues.reportingEmails ?? [])
  const [reportingEmailInput, setReportingEmailInput] = useState('')
  const [reportingEmailError, setReportingEmailError] = useState('')
  const [reportingDays, setReportingDays] = useState<string[]>(
    defaultValues.reportingDays ?? ['MON', 'TUE', 'WED', 'THU', 'FRI']
  )

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : []))
      .then((settings: { key: string; value: string }[]) => {
        const dgm = settings.find((x) => x.key === 'MIN_DGM_PERCENT')
        if (dgm) setDgmThreshold(parseFloat(dgm.value) / 100)
        const vt = settings.find((x) => x.key === 'VENDOR_MIN_FIT_SCORE')
        if (vt) setGlobalVendorThreshold(parseFloat(vt.value))
        const dt = settings.find((x) => x.key === 'DIRECT_MIN_FIT_SCORE')
        if (dt) setGlobalDirectThreshold(parseFloat(dt.value))
      })
      .catch(() => {})
  }, [])

  const crNum = parseFloat(clientRate)
  const icbNum = parseFloat(internalCostBudget)
  const dgm =
    !isNaN(crNum) && crNum > 0 && !isNaN(icbNum) ? (crNum - icbNum) / crNum : null
  const dgmAtRisk = dgm != null && dgm < dgmThreshold

  const recruiters = users.filter((u) => u.role === 'RECRUITER' || u.role === 'ADMIN')

  function addReportingEmail() {
    const email = reportingEmailInput.trim()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setReportingEmailError('Invalid email address')
      return
    }
    if (reportingEmails.includes(email)) {
      setReportingEmailError('Already added')
      return
    }
    setReportingEmails((prev) => [...prev, email])
    setReportingEmailInput('')
    setReportingEmailError('')
  }

  function toggleReportingDay(day: string) {
    setReportingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  function addLocation(loc: string) {
    if (!loc) return
    if (loc === 'Anywhere LATAM') {
      setLocations(['Anywhere LATAM'])
      return
    }
    if (locations.includes('Anywhere LATAM')) return
    if (!locations.includes(loc)) setLocations((prev) => [...prev, loc])
  }

  function removeLocation(loc: string) {
    setLocations((prev) => prev.filter((l) => l !== loc))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (locations.length === 0) {
      setError('Select at least one location.')
      setLoading(false)
      return
    }

    const fd = new FormData(e.currentTarget)

    const payload: Record<string, unknown> = {
      title: fd.get('title') as string,
      client: fd.get('client') as string,
      description: fd.get('description') as string,
      priority: fd.get('priority') as string,
      target_date_asap: isAsap,
      target_date: isAsap ? null : (fd.get('target_date') ? new Date(fd.get('target_date') as string).toISOString() : null),
      location: locations,
      recruiterId: (fd.get('recruiterId') as string) || undefined,
      hiring_manager_name: (fd.get('hiring_manager_name') as string) || null,
      hiring_manager_email: (fd.get('hiring_manager_email') as string) || null,
      sales_contact_email: (fd.get('sales_contact_email') as string) || null,
      clientRate: clientRate !== '' && !isNaN(crNum) ? crNum : null,
      internalCostBudget: internalCostBudget !== '' && !isNaN(icbNum) ? icbNum : null,
      vendorMinFitScore: vendorMinFitScore !== '' && !isNaN(parseInt(vendorMinFitScore)) ? parseInt(vendorMinFitScore) : null,
      directMinFitScore: directMinFitScore !== '' && !isNaN(parseInt(directMinFitScore)) ? parseInt(directMinFitScore) : null,
      talentId: (fd.get('talentId') as string) || null,
      reportingEmails,
      reportingDays,
    }

    if (mode === 'edit') {
      payload.status = fd.get('status') as string
    }

    const url = mode === 'edit' ? `/api/positions/${defaultValues.id}` : '/api/positions'
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
          : data.error?.formErrors?.[0] ?? 'Something went wrong.'
      setError(msg)
      return
    }

    router.push('/positions')
    router.refresh()
  }

  const anywhereSelected = locations.includes('Anywhere LATAM')
  const availableLocations = LATAM_LOCATIONS.filter((l) => !locations.includes(l))

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Title */}
        <div className="col-span-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={defaultValues.title}
            placeholder="e.g. Senior Software Engineer"
          />
        </div>

        {/* Client */}
        <div>
          <Label htmlFor="client">Client *</Label>
          <Input
            id="client"
            name="client"
            required
            defaultValue={defaultValues.client}
            placeholder="e.g. Acme Corp"
          />
        </div>

        {/* TalentID */}
        <div>
          <Label htmlFor="talentId">TalentID</Label>
          <Input
            id="talentId"
            name="talentId"
            defaultValue={defaultValues.talentId ?? ''}
            placeholder="Optional internal ID"
          />
        </div>

        {/* Priority */}
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select
            id="priority"
            name="priority"
            defaultValue={defaultValues.priority ?? 'MEDIUM'}
          >
            {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map((p) => (
              <option key={p} value={p} className={PRIORITY_COLORS[p]}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </div>

        {/* Description */}
        <div className="col-span-2">
          <Label htmlFor="description">Job Description *</Label>
          <Textarea
            id="description"
            name="description"
            required
            defaultValue={defaultValues.description}
            placeholder="Describe the role, responsibilities, and requirements…"
            className="min-h-[180px]"
          />
        </div>

        {/* Target Date */}
        <div className="col-span-2">
          <Label>Target Date</Label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAsap}
                onChange={(e) => setIsAsap(e.target.checked)}
                className="rounded border-gray-300 text-gray-900"
              />
              <span className="text-sm text-gray-700 font-medium">ASAP</span>
            </label>
            {!isAsap && (
              <Input
                type="date"
                name="target_date"
                defaultValue={
                  defaultValues.target_date
                    ? new Date(defaultValues.target_date).toISOString().slice(0, 10)
                    : ''
                }
                required={!isAsap}
              />
            )}
          </div>
        </div>

        {/* Location */}
        <div className="col-span-2">
          <Label>Location * (select all that apply)</Label>
          <Select
            onChange={(e) => {
              addLocation(e.target.value)
              e.target.value = ''
            }}
            value=""
            disabled={anywhereSelected}
          >
            <option value="">— Add location —</option>
            {availableLocations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </Select>
          {locations.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {locations.map((loc) => (
                <span
                  key={loc}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs font-medium"
                >
                  {loc}
                  <button
                    type="button"
                    onClick={() => removeLocation(loc)}
                    className="text-gray-400 hover:text-gray-600 ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Recruiter */}
        {recruiters.length > 0 && (
          <div>
            <Label htmlFor="recruiterId">Recruiter</Label>
            <Select
              id="recruiterId"
              name="recruiterId"
              defaultValue={defaultValues.recruiterId ?? ''}
            >
              <option value="">— Select recruiter —</option>
              {recruiters.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Status (edit only) */}
        {mode === 'edit' && (
          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              name="status"
              defaultValue={defaultValues.status ?? 'OPEN'}
            >
              <option value="OPEN">Open</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="CLOSED">Closed</option>
              <option value="FILLED">Filled</option>
            </Select>
          </div>
        )}

        {/* Hiring Manager */}
        <div>
          <Label htmlFor="hiring_manager_name">Hiring Manager Name</Label>
          <Input
            id="hiring_manager_name"
            name="hiring_manager_name"
            defaultValue={defaultValues.hiring_manager_name ?? ''}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="hiring_manager_email">Hiring Manager Email</Label>
          <Input
            id="hiring_manager_email"
            name="hiring_manager_email"
            type="email"
            defaultValue={defaultValues.hiring_manager_email ?? ''}
            placeholder="Optional"
          />
        </div>

        {/* Sales Contact */}
        <div className="col-span-2">
          <Label htmlFor="sales_contact_email">Sales Contact Email</Label>
          <Input
            id="sales_contact_email"
            name="sales_contact_email"
            type="email"
            defaultValue={defaultValues.sales_contact_email ?? ''}
            placeholder="Optional"
          />
        </div>
      </div>

      {/* Compensation & Margin */}
      <div className="border-t border-gray-100 pt-6">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Compensation &amp; Margin</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="clientRate">Client Rate ($/hour)</Label>
            <Input
              id="clientRate"
              type="number"
              min={0}
              value={clientRate}
              onChange={(e) => setClientRate(e.target.value)}
              placeholder="e.g. 10000"
            />
          </div>
          <div>
            <Label htmlFor="internalCostBudget">Internal Cost Budget ($/hour)</Label>
            <Input
              id="internalCostBudget"
              type="number"
              min={0}
              value={internalCostBudget}
              onChange={(e) => setInternalCostBudget(e.target.value)}
              placeholder="e.g. 5500"
            />
          </div>
        </div>
        {dgm != null && (
          <div className="mt-3 text-sm">
            <span className="text-gray-500">Delivery Gross Margin: </span>
            <span className={`font-semibold ${dgmAtRisk ? 'text-red-600' : 'text-green-600'}`}>
              {(dgm * 100).toFixed(1)}%
            </span>
            {dgmAtRisk && (
              <span className="ml-2 text-red-600">
                ⚠️ Below minimum threshold ({(dgmThreshold * 100).toFixed(0)}%)
              </span>
            )}
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h3 className="text-sm font-medium text-gray-900 mb-1">Screening Thresholds (per position)</h3>
          <p className="text-xs text-gray-400 mb-3">Per-position overrides for the global fit score minimums. Leave blank to use the global setting.</p>
          <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vendorMinFitScore">Partner Submission Min Score</Label>
            <p className="text-xs text-gray-400 mb-1">Global default: {globalVendorThreshold}</p>
            <Input
              id="vendorMinFitScore"
              type="number"
              min={0}
              max={100}
              value={vendorMinFitScore}
              onChange={(e) => setVendorMinFitScore(e.target.value)}
              placeholder={`Default: ${globalVendorThreshold} (from Settings)`}
            />
          </div>
          <div>
            <Label htmlFor="directMinFitScore">Direct Application Min Score</Label>
            <p className="text-xs text-gray-400 mb-1">Global default: {globalDirectThreshold}</p>
            <Input
              id="directMinFitScore"
              type="number"
              min={0}
              max={100}
              value={directMinFitScore}
              onChange={(e) => setDirectMinFitScore(e.target.value)}
              placeholder={`Default: ${globalDirectThreshold} (from Settings)`}
            />
          </div>
        </div>
        </div>
      </div>

      {/* Reporting */}
      <div className="border-t border-gray-100 pt-6">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Reporting</h2>
        <div className="space-y-4">
          <div>
            <Label>Reporting Emails</Label>
            <p className="text-xs text-gray-400 mb-1">Recipients for automated position reports.</p>
            <div className="flex gap-2">
              <Input
                type="email"
                value={reportingEmailInput}
                onChange={(e) => { setReportingEmailInput(e.target.value); setReportingEmailError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReportingEmail() } }}
                placeholder="email@example.com"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={addReportingEmail}>Add</Button>
            </div>
            {reportingEmailError && <p className="text-xs text-red-600 mt-1">{reportingEmailError}</p>}
            {reportingEmails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {reportingEmails.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 text-xs font-medium">
                    {email}
                    <button type="button" onClick={() => setReportingEmails((prev) => prev.filter((e) => e !== email))} className="text-blue-400 hover:text-blue-700 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Reporting Frequency</Label>
            <p className="text-xs text-gray-400 mb-2">Which days to send reports.</p>
            <div className="flex gap-2">
              {REPORTING_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleReportingDay(day)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    reportingDays.includes(day)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {REPORTING_DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Position'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/positions')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
