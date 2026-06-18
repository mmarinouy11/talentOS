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
  const [dgmThreshold, setDgmThreshold] = useState<number>(0.4)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : []))
      .then((settings: { key: string; value: string }[]) => {
        const s = settings.find((x) => x.key === 'MIN_DGM_PERCENT')
        if (s) setDgmThreshold(parseFloat(s.value) / 100)
      })
      .catch(() => {})
  }, [])

  const crNum = parseFloat(clientRate)
  const icbNum = parseFloat(internalCostBudget)
  const dgm =
    !isNaN(crNum) && crNum > 0 && !isNaN(icbNum) ? (crNum - icbNum) / crNum : null
  const dgmAtRisk = dgm != null && dgm < dgmThreshold

  const recruiters = users.filter((u) => u.role === 'RECRUITER' || u.role === 'ADMIN')

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
            <Label htmlFor="clientRate">Client Rate ($/month)</Label>
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
            <Label htmlFor="internalCostBudget">Internal Cost Budget ($/month)</Label>
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
