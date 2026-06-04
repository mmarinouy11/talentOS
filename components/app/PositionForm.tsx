'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import type { Role } from '@prisma/client'

export interface UserOption {
  id: string
  name: string | null
  email: string
  role: Role
}

interface PositionFormProps {
  users: UserOption[]
  defaultValues?: {
    id?: string
    title?: string
    department?: string
    description?: string
    status?: string
    sla_days?: number
    budget_min?: number | null
    budget_max?: number | null
    currency?: string
    recruiterId?: string
    hiringManagerId?: string
  }
  mode: 'create' | 'edit'
}

export function PositionForm({ users, defaultValues = {}, mode }: PositionFormProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const recruiters = users.filter((u) => u.role === 'RECRUITER' || u.role === 'ADMIN')
  const hiringManagers = users.filter((u) => u.role === 'HIRING_MANAGER' || u.role === 'ADMIN')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const fd = new FormData(e.currentTarget)

    const payload = {
      title: fd.get('title') as string,
      department: fd.get('department') as string,
      description: fd.get('description') as string,
      status: fd.get('status') as string,
      sla_days: Number(fd.get('sla_days')),
      budget_min: fd.get('budget_min') ? Number(fd.get('budget_min')) : null,
      budget_max: fd.get('budget_max') ? Number(fd.get('budget_max')) : null,
      currency: fd.get('currency') as string,
      recruiterId: fd.get('recruiterId') as string || undefined,
      hiringManagerId: fd.get('hiringManagerId') as string || undefined,
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
      setError(data.error?.formErrors?.[0] ?? 'Something went wrong.')
      return
    }

    router.push('/positions')
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
        <div className="col-span-2">
          <Label htmlFor="title">Title *</Label>
          <Input id="title" name="title" required defaultValue={defaultValues.title} placeholder="e.g. Senior Software Engineer" />
        </div>

        <div>
          <Label htmlFor="department">Department *</Label>
          <Input id="department" name="department" required defaultValue={defaultValues.department} placeholder="e.g. Engineering" />
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={defaultValues.status ?? 'OPEN'}>
            <option value="OPEN">Open</option>
            <option value="ON_HOLD">On Hold</option>
          </Select>
        </div>

        <div className="col-span-2">
          <Label htmlFor="description">Job Description *</Label>
          <Textarea id="description" name="description" required defaultValue={defaultValues.description} placeholder="Describe the role, responsibilities, and requirements…" className="min-h-[180px]" />
        </div>

        <div>
          <Label htmlFor="sla_days">SLA (days)</Label>
          <Input id="sla_days" name="sla_days" type="number" min="1" defaultValue={defaultValues.sla_days ?? 30} />
        </div>

        <div>
          <Label htmlFor="currency">Currency</Label>
          <Select id="currency" name="currency" defaultValue={defaultValues.currency ?? 'USD'}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="UYU">UYU</option>
          </Select>
        </div>

        <div>
          <Label htmlFor="budget_min">Budget Min</Label>
          <Input id="budget_min" name="budget_min" type="number" min="0" defaultValue={defaultValues.budget_min ?? ''} placeholder="Optional" />
        </div>

        <div>
          <Label htmlFor="budget_max">Budget Max</Label>
          <Input id="budget_max" name="budget_max" type="number" min="0" defaultValue={defaultValues.budget_max ?? ''} placeholder="Optional" />
        </div>

        {recruiters.length > 0 && (
          <div>
            <Label htmlFor="recruiterId">Recruiter</Label>
            <Select id="recruiterId" name="recruiterId" defaultValue={defaultValues.recruiterId ?? ''}>
              <option value="">— Select recruiter —</option>
              {recruiters.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </Select>
          </div>
        )}

        {hiringManagers.length > 0 && (
          <div>
            <Label htmlFor="hiringManagerId">Hiring Manager</Label>
            <Select id="hiringManagerId" name="hiringManagerId" defaultValue={defaultValues.hiringManagerId ?? ''}>
              <option value="">— Select hiring manager —</option>
              {hiringManagers.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </Select>
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
