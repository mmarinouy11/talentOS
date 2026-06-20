'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Template = 'scheduling' | 'rejection' | 'advance'

export default function EmailTestPage() {
  const [template, setTemplate] = useState<Template>('scheduling')
  const [to, setTo] = useState('')
  const [candidateName, setCandidateName] = useState('Test Candidate')
  const [positionTitle, setPositionTitle] = useState('Senior Engineer')
  const [client, setClient] = useState('Acme Corp')
  const [roundLabel, setRoundLabel] = useState('Technical Round 1')
  const [nextRoundLabel, setNextRoundLabel] = useState('Client Interview')
  const [recruiterName, setRecruiterName] = useState('Test Recruiter')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/settings/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, to, candidateName, positionTitle, client, roundLabel, nextRoundLabel, recruiterName }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, msg: `Sent! Subject: "${data.subject}"` })
      } else {
        setResult({ ok: false, msg: data.error ?? 'Failed to send' })
      }
    } catch {
      setResult({ ok: false, msg: 'Network error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <nav className="text-sm text-gray-500 mb-1">
          <Link href="/settings" className="hover:text-gray-900">Settings</Link>
          <span className="mx-2">›</span>
          <span className="text-gray-900">Email Test</span>
        </nav>
        <h1 className="text-2xl font-semibold text-gray-900">Email Test</h1>
        <p className="text-sm text-gray-500 mt-0.5">Send a test email using any template to verify Resend is configured correctly.</p>
      </div>

      <form onSubmit={send} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <Label htmlFor="template">Template</Label>
          <select
            id="template"
            value={template}
            onChange={(e) => setTemplate(e.target.value as Template)}
            className="mt-1 block w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8DF000]"
          >
            <option value="scheduling">Scheduling Request</option>
            <option value="rejection">Rejection</option>
            <option value="advance">Advance Notification</option>
          </select>
        </div>

        <div>
          <Label htmlFor="to">Recipient Email</Label>
          <Input id="to" type="email" value={to} onChange={(e) => setTo(e.target.value)} required className="mt-1" placeholder="test@example.com" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="candidateName">Candidate Name</Label>
            <Input id="candidateName" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="recruiterName">Recruiter Name</Label>
            <Input id="recruiterName" value={recruiterName} onChange={(e) => setRecruiterName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="positionTitle">Position Title</Label>
            <Input id="positionTitle" value={positionTitle} onChange={(e) => setPositionTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="client">Client</Label>
            <Input id="client" value={client} onChange={(e) => setClient(e.target.value)} className="mt-1" />
          </div>
          {template === 'scheduling' && (
            <div className="col-span-2">
              <Label htmlFor="roundLabel">Round Label</Label>
              <Input id="roundLabel" value={roundLabel} onChange={(e) => setRoundLabel(e.target.value)} className="mt-1" />
            </div>
          )}
          {template === 'advance' && (
            <div className="col-span-2">
              <Label htmlFor="nextRoundLabel">Next Round Label</Label>
              <Input id="nextRoundLabel" value={nextRoundLabel} onChange={(e) => setNextRoundLabel(e.target.value)} className="mt-1" />
            </div>
          )}
        </div>

        {result && (
          <div className={`rounded-lg px-4 py-3 text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.msg}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send Test Email'}</Button>
        </div>
      </form>
    </div>
  )
}
