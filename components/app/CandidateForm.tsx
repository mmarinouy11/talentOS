'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { TagInput } from './TagInput'
import type { Seniority } from '@prisma/client'

const LATAM_COUNTRIES = [
  'Argentina',
  'Bolivia',
  'Brazil',
  'Chile',
  'Colombia',
  'Ecuador',
  'Mexico',
  'Paraguay',
  'Peru',
  'Uruguay',
  'Venezuela',
  'Other',
]

interface CandidateFormProps {
  mode: 'create' | 'edit'
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
    skills?: string[]
    languages?: string[]
    notes?: string | null
  }
}

export function CandidateForm({ mode, defaultValues = {} }: CandidateFormProps) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [skills, setSkills] = useState<string[]>(defaultValues.skills ?? [])
  const [languages, setLanguages] = useState<string[]>(defaultValues.languages ?? [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const fd = new FormData(e.currentTarget)

    const yearsStr = fd.get('yearsOfExperience') as string
    const payload: Record<string, unknown> = {
      firstName: fd.get('firstName') as string,
      lastName: fd.get('lastName') as string,
      email: fd.get('email') as string,
      phone: (fd.get('phone') as string) || null,
      country: (fd.get('country') as string) || null,
      linkedinUrl: (fd.get('linkedinUrl') as string) || null,
      seniority: (fd.get('seniority') as string) || undefined,
      yearsOfExperience: yearsStr ? parseInt(yearsStr, 10) : null,
      skills,
      languages,
      notes: (fd.get('notes') as string) || null,
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
        <div>
          <Label htmlFor="firstName">First Name *</Label>
          <Input id="firstName" name="firstName" required defaultValue={defaultValues.firstName} />
        </div>
        <div>
          <Label htmlFor="lastName">Last Name *</Label>
          <Input id="lastName" name="lastName" required defaultValue={defaultValues.lastName} />
        </div>

        <div>
          <Label htmlFor="email">Email *</Label>
          <Input id="email" name="email" type="email" required defaultValue={defaultValues.email} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={defaultValues.phone ?? ''} placeholder="Optional" />
        </div>

        <div>
          <Label htmlFor="country">Country</Label>
          <Select id="country" name="country" defaultValue={defaultValues.country ?? ''}>
            <option value="">— Select country —</option>
            {LATAM_COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
          <Input id="linkedinUrl" name="linkedinUrl" type="url" defaultValue={defaultValues.linkedinUrl ?? ''} placeholder="https://linkedin.com/in/…" />
        </div>

        <div>
          <Label htmlFor="seniority">Seniority</Label>
          <Select id="seniority" name="seniority" defaultValue={defaultValues.seniority ?? ''}>
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
            name="yearsOfExperience"
            type="number"
            min={0}
            defaultValue={defaultValues.yearsOfExperience ?? ''}
            placeholder="Optional"
          />
        </div>

        <div className="col-span-2">
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
            name="notes"
            defaultValue={defaultValues.notes ?? ''}
            placeholder="Any additional notes…"
            className="min-h-[100px]"
          />
        </div>
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
