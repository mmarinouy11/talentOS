'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type Draft = { subject: string; body: string; cvName: string | null; hasCv: boolean; suggestions: string[]; gmailConnected: boolean; personName: string }

const inputCls = 'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#2F2C29] focus:outline-none'
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const split = (v: string) => v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)

// Comma-separated email input with autocomplete on the part being typed (addresses from previous proposals)
function EmailsInput({ id, value, onChange, suggestions, placeholder }: { id: string; value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string }) {
  const parts = value.split(',')
  const current = parts[parts.length - 1].trim().toLowerCase()
  const chosen = new Set(split(value).map((e) => e.toLowerCase()))
  const options = current.length >= 1 ? suggestions.filter((s) => s.includes(current) && !chosen.has(s)).slice(0, 6) : []
  return (
    <div className="relative">
      <input id={id} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
      {options.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-sm">
          {options.map((o) => (
            <li key={o}>
              <button type="button" className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-[#F5F0EB]"
                onMouseDown={(e) => { e.preventDefault(); onChange([...parts.slice(0, -1).map((p) => p.trim()).filter(Boolean), o].join(', ') + ', ') }}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// "Propose by email" for a global opportunity match: sent from the user's own Gmail with the roster CV attached.
// No Gmail / expired → reconnect link + "Open in Gmail" (plain text, no attachment) + "Download CV" + manual mark.
export function ProposeByEmailModal({ matchId, profileId, personName, designation, onClose, onDone }: {
  matchId: string; profileId: string; personName: string; designation: string
  onClose: () => void; onDone: (message: string) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState('')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fallback, setFallback] = useState<null | 'not-connected' | 'expired'>(null)
  const [openedGmail, setOpenedGmail] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/opportunity-matches/${matchId}/proposal-draft`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) { setLoadError(d.error ?? 'Could not prepare the email'); return }
        setDraft(d); setSubject(d.subject); setBody(d.body)
        if (!d.gmailConnected) setFallback('not-connected')
      })
      .catch(() => { if (!cancelled) setLoadError('Could not prepare the email') })
    return () => { cancelled = true }
  }, [matchId])

  function validate(): string | null {
    const toList = split(to), ccList = split(cc)
    const bad = [...toList, ...ccList].filter((e) => !EMAIL_RE.test(e))
    if (bad.length > 0) return `Invalid email address: ${bad.join(', ')}`
    if (toList.length === 0) return 'Add at least one recipient'
    if (!subject.trim() || !body.trim()) return 'Subject and body are required'
    return null
  }

  async function send() {
    const v = validate(); if (v) { setError(v); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/opportunity-matches/${matchId}/propose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, cc, subject, body }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { onDone(`${personName} proposed for ${designation} — sent from your Gmail.`); return }
      if (d.code === 'GMAIL_NOT_CONNECTED') { setFallback('not-connected'); return }
      if (d.code === 'GMAIL_EXPIRED') { setFallback('expired'); return }
      setError(typeof d.error === 'string' ? d.error : 'Not sent')
    } catch {
      setError('Not sent: connection error')
    } finally {
      setBusy(false)
    }
  }

  async function markManual() {
    const v = validate(); if (v) { setError(v); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/opportunity-matches/${matchId}/propose-manual`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, cc, subject, body }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { onDone(`${personName} marked as proposed for ${designation}.`); return }
      setError(typeof d.error === 'string' ? d.error : 'Could not mark as proposed')
    } finally {
      setBusy(false)
    }
  }

  function openInGmail() {
    const v = validate(); if (v) { setError(v); return }
    const params = new URLSearchParams({ view: 'cm', fs: '1', to: split(to).join(','), su: subject, body })
    if (split(cc).length > 0) params.set('cc', split(cc).join(','))
    window.open(`https://mail.google.com/mail/?${params.toString()}`, '_blank', 'noopener')
    setOpenedGmail(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Propose {personName} for {designation}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-6 py-4 space-y-3">
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {!draft && !loadError && <p className="text-sm text-gray-500">Preparing the email…</p>}
          {draft && (
            <>
              {fallback && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 space-y-2">
                  <p>
                    {fallback === 'expired' ? 'Your Gmail connection expired. ' : ''}
                    <a href="/profile" className="font-medium underline underline-offset-2">Connect your Gmail to send from TalentOS</a>
                    {' '}— or send it yourself:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={openInGmail}>Open in Gmail</Button>
                    {draft.hasCv && <a href={`/api/redeployment/${profileId}/roster-cv`} className="inline-flex"><Button size="sm" variant="outline" type="button">Download CV</Button></a>}
                    {openedGmail && <Button size="sm" onClick={markManual} disabled={busy}>I sent it — mark as proposed</Button>}
                  </div>
                  <p className="text-xs text-amber-800">Gmail opens with To, Subject and Body prefilled (plain text). Attach the CV yourself.</p>
                </div>
              )}
              <div>
                <label htmlFor="pe-to" className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <EmailsInput id="pe-to" value={to} onChange={setTo} suggestions={draft.suggestions} placeholder="name@company.com, other@company.com" />
              </div>
              <div>
                <label htmlFor="pe-cc" className="block text-xs font-medium text-gray-600 mb-1">CC (optional)</label>
                <EmailsInput id="pe-cc" value={cc} onChange={setCc} suggestions={draft.suggestions} />
              </div>
              <div>
                <label htmlFor="pe-subject" className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input id="pe-subject" className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label htmlFor="pe-body" className="block text-xs font-medium text-gray-600 mb-1">Body</label>
                <textarea id="pe-body" className={`${inputCls} min-h-[260px] font-sans`} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <p className="text-xs text-gray-600">
                {draft.hasCv
                  ? <>Attachment: <span className="font-medium text-[#2F2C29]">{draft.cvName ?? 'Roster CV'}</span></>
                  : <span className="text-amber-700">No roster CV for this person — the email will be sent without an attachment.</span>}
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          {draft && !fallback && <Button onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send from my Gmail'}</Button>}
        </div>
      </div>
    </div>
  )
}
