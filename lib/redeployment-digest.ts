import { db } from './db'
import { trySendEmailViaSystemGmail } from './email'
import { getGlobalOpportunitySettings } from './global-opportunity-settings'
import { getVisibleMatches } from './redeployment-match-view'
import { lwdChip } from './redeployment-display'

const LAST_DIGEST_KEY = 'REDEPLOYMENT_LAST_DIGEST_AT'
const DAY_MS = 86_400_000
const CHARCOAL = '#2F2C29'
const CREAM = '#F5F0EB'
const LIME = '#8CF000'
const FONT = 'Arial, Helvetica, sans-serif'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

export async function buildRedeploymentDigest(now = new Date()): Promise<{ subject: string; html: string; people: number }> {
  const settings = await getGlobalOpportunitySettings()
  const lastRow = await db.systemSettings.findUnique({ where: { key: LAST_DIGEST_KEY } })
  const lastDigestAt = lastRow ? new Date(lastRow.value) : null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  const active = await db.redeploymentProfile.findMany({ where: { status: 'ACTIVE' }, select: { lwd: true, firstSeenAt: true } })
  const releasingSoon = active.filter((p) => p.lwd && p.lwd.getTime() >= today && p.lwd.getTime() <= today + 30 * DAY_MS).length
  const releasedRecently = active.filter((p) => p.lwd && p.lwd.getTime() < today && p.lwd.getTime() >= today - 30 * DAY_MS).length
  const newThisWeek = active.filter((p) => p.firstSeenAt.getTime() >= now.getTime() - 7 * DAY_MS).length

  // Same visibility as the Matches tab; NEW/PROPOSED at or above the minimum score, top 3 per section
  const keep = (m: { status: string; score: number }) => (m.status === 'NEW' || m.status === 'PROPOSED') && m.score >= settings.minScore
  const people = (await getVisibleMatches()).people
    .map((p) => ({ p, positions: p.positionMatches.filter(keep).slice(0, 3), groups: p.groupMatches.filter(keep).slice(0, 3) }))
    .filter((x) => x.positions.length + x.groups.length > 0)
    .sort((a, b) => Math.max(...[...b.positions, ...b.groups].map((m) => m.score)) - Math.max(...[...a.positions, ...a.groups].map((m) => m.score)))

  const base = process.env.NEXTAUTH_URL ?? ''
  const link = `${base}/redeployment?tab=matches`
  const stat = (label: string, n: number) =>
    `<td style="padding:10px 14px;background:${CREAM};border-radius:6px;font-family:${FONT};"><div style="font-size:20px;font-weight:700;color:${CHARCOAL};">${n}</div><div style="font-size:11px;color:#5E5751;">${label}</div></td>`

  const tags = (m: { createdAt: Date; status: string }) =>
    `${!lastDigestAt || m.createdAt > lastDigestAt ? ` <span style="background:${LIME};color:${CHARCOAL};font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;">New</span>` : ''}${m.status === 'PROPOSED' ? ` <span style="background:${CREAM};color:${CHARCOAL};font-size:10px;padding:1px 6px;border-radius:3px;">Proposed</span>` : ''}`
  const row = (score: number, title: string, sub: string, sub2?: string) => `<tr>
        <td style="padding:6px 8px;font-family:${FONT};font-size:13px;font-weight:700;color:${CHARCOAL};vertical-align:top;width:32px;">${score}</td>
        <td style="padding:6px 8px;font-family:${FONT};font-size:13px;color:${CHARCOAL};vertical-align:top;">${title}
          <div style="font-size:12px;color:#5E5751;">${sub}</div>${sub2 ? `<div style="font-size:11px;color:#8A847D;">${sub2}</div>` : ''}
        </td>
      </tr>`
  const section = (heading: string, rows: string) => rows
    ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;color:#5E5751;text-transform:uppercase;letter-spacing:1px;margin:8px 0 2px 0;">${heading}</div><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">${rows}</table>`
    : ''

  const personBlocks = people.map(({ p, positions, groups }) => {
    const chip = lwdChip(p.lwd, now)
    const positionRows = positions.map((m) => row(
      m.score,
      `<a href="${esc(`${base}/positions/${m.position.id}`)}" style="color:${CHARCOAL};">${esc(m.position.title)}</a>${m.position.type === 'PROACTIVE' ? ' <span style="font-size:10px;color:#5E5751;">(Proactive)</span>' : ''}${tags(m)}`,
      esc(m.position.client),
    )).join('')
    const groupRows = groups.map((m) => row(
      m.score,
      `${esc(m.group.designation)}${tags(m)}`,
      `${esc(m.group.accountName ?? m.group.groupAccountName ?? '—')} · ${esc(m.group.location)} · ${esc(m.group.workMode ?? 'Unknown')} · ${m.group.openings} opening${m.group.openings === 1 ? '' : 's'}`,
      `Req ${esc(m.group.requisitionIds.join(', '))} · Onboarding ${fmtDate(m.group.plannedOnboardingDate)}`,
    )).join('')
    return `<div style="margin:0 0 18px 0;border:1px solid #E5E0D8;border-radius:8px;padding:12px 14px;">
      <div style="font-family:${FONT};font-size:14px;font-weight:700;color:${CHARCOAL};">${esc(p.name)}
        ${chip ? `<span style="font-weight:400;font-size:11px;background:${chip.tone === 'soon' ? '#FEF3C7' : '#F3F4F6'};color:${chip.tone === 'soon' ? '#92400E' : '#4B5563'};padding:1px 6px;border-radius:9px;margin-left:6px;">${esc(chip.label)}</span>` : ''}
      </div>
      <div style="font-family:${FONT};font-size:12px;color:#5E5751;margin-bottom:4px;">${esc(p.lastJobTitle ?? '—')}${p.grade ? ` · Grade ${esc(p.grade)}` : ''}</div>
      ${section('TalentOS positions', positionRows)}${section('Global opportunities', groupRows)}
    </div>`
  }).join('')

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#FFFFFF;">
  <div style="max-width:640px;margin:0 auto;padding:24px;font-family:${FONT};color:${CHARCOAL};">
    <div style="border-bottom:3px solid ${LIME};padding-bottom:10px;margin-bottom:16px;">
      <h1 style="font-size:20px;margin:0;color:${CHARCOAL};">Redeployment — weekly digest</h1>
      <p style="font-size:12px;color:#5E5751;margin:4px 0 0 0;">${fmtDate(now)}</p>
    </div>
    <table cellpadding="0" cellspacing="6" style="border-collapse:separate;margin:0 -6px 18px -6px;"><tr>
      ${stat('Active people', active.length)}${stat('Releasing in 30 days', releasingSoon)}${stat('Released last 30 days', releasedRecently)}${stat('New this week', newThisWeek)}
    </tr></table>
    <h2 style="font-size:15px;margin:0 0 10px 0;color:${CHARCOAL};">Top matches (score ≥ ${settings.minScore})</h2>
    ${personBlocks || `<p style="font-size:13px;color:#5E5751;">No matches at or above ${settings.minScore} this week.</p>`}
    <p style="margin:20px 0 0 0;"><a href="${esc(link)}" style="display:inline-block;background:${CHARCOAL};color:${LIME};font-weight:700;font-size:13px;padding:9px 16px;border-radius:4px;text-decoration:none;">Open Matches</a></p>
  </div></body></html>`
  return { subject: `Redeployment digest — ${people.length} ${people.length === 1 ? 'person' : 'people'} with matches`, html, people: people.length }
}

export const LAST_DIGEST_RESULT_KEY = 'REDEPLOYMENT_LAST_DIGEST_RESULT'

export interface DigestResult {
  at: string
  outcome: 'sent' | 'partial' | 'skipped' | 'error'
  detail: string
  sentTo: string[]
  failed: { to: string; reason: string }[]
}

async function saveResult(r: DigestResult) {
  await db.systemSettings.upsert({
    where: { key: LAST_DIGEST_RESULT_KEY },
    update: { value: JSON.stringify(r) },
    create: { key: LAST_DIGEST_RESULT_KEY, value: JSON.stringify(r), description: 'Result of the last Monday Redeployment digest (managed automatically).' },
  })
}

export async function getLastDigestResult(): Promise<DigestResult | null> {
  const row = await db.systemSettings.findUnique({ where: { key: LAST_DIGEST_RESULT_KEY } })
  if (!row) return null
  try { return JSON.parse(row.value) as DigestResult } catch { return null }
}

// Monday send: only to REDEPLOYMENT_DIGEST_RECIPIENTS (nothing when empty). Each address reports whether it really
// went out; the result (sent / partial / skipped / error) is stored for the Matches tab and logged.
// The "New since last digest" marker only moves when at least one email was actually sent.
export async function sendRedeploymentDigest(): Promise<DigestResult> {
  const now = new Date()
  const base = { at: now.toISOString(), sentTo: [] as string[], failed: [] as { to: string; reason: string }[] }
  let result: DigestResult
  try {
    const { digestRecipients } = await getGlobalOpportunitySettings()
    if (digestRecipients.length === 0) {
      result = { ...base, outcome: 'skipped', detail: 'No recipients configured (REDEPLOYMENT_DIGEST_RECIPIENTS is empty)' }
    } else {
      const { subject, html } = await buildRedeploymentDigest(now)
      for (const to of digestRecipients) {
        const r = await trySendEmailViaSystemGmail({ to, subject, html })
        if (r.sent) base.sentTo.push(to); else base.failed.push({ to, reason: r.reason })
      }
      const reasons = [...new Set(base.failed.map((f) => f.reason))].join('; ')
      result = base.failed.length === 0
        ? { ...base, outcome: 'sent', detail: `Sent to ${base.sentTo.length} recipient${base.sentTo.length === 1 ? '' : 's'}` }
        : base.sentTo.length > 0
          ? { ...base, outcome: 'partial', detail: `Sent to ${base.sentTo.length}, not sent to ${base.failed.length}: ${reasons}` }
          : { ...base, outcome: 'skipped', detail: `Not sent: ${reasons}` }
      if (base.sentTo.length > 0) {
        await db.systemSettings.upsert({
          where: { key: LAST_DIGEST_KEY },
          update: { value: now.toISOString() },
          create: { key: LAST_DIGEST_KEY, value: now.toISOString(), description: 'Last Monday Redeployment digest (managed automatically).' },
        })
      }
    }
  } catch (err) {
    result = { ...base, outcome: 'error', detail: err instanceof Error ? err.message : 'Unknown error building the digest' }
  }
  if (result.outcome === 'sent') console.log(`[redeployment-digest] ${result.detail}`)
  else console.warn(`[redeployment-digest] WARNING: digest ${result.outcome} — ${result.detail}`)
  await saveResult(result).catch((err) => console.error('[redeployment-digest] Could not store the result:', err))
  return result
}

// Test send to one address; does not move the "New since last digest" marker or the stored Monday result
export async function sendTestRedeploymentDigest(to: string): Promise<{ sent: true } | { sent: false; reason: string }> {
  const { subject, html } = await buildRedeploymentDigest()
  return trySendEmailViaSystemGmail({ to, subject: `[Test] ${subject}`, html })
}
