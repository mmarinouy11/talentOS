import { db } from './db'
import { sendEmailViaSystemGmail } from './email'
import { getGlobalOpportunitySettings } from './global-opportunity-settings'
import { getActiveOpportunityGroups } from './redeployment-matching'
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

  const active = await db.redeploymentProfile.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, lwd: true, firstSeenAt: true, lastJobTitle: true, grade: true, preferredName: true, firstName: true, lastName: true,
      candidate: { select: { firstName: true, lastName: true } },
      opportunityMatches: {
        where: { status: { in: ['NEW', 'PROPOSED'] }, score: { gte: settings.minScore } },
        orderBy: { score: 'desc' },
      },
    },
  })
  const releasingSoon = active.filter((p) => p.lwd && p.lwd.getTime() >= today && p.lwd.getTime() <= today + 30 * DAY_MS).length
  const releasedRecently = active.filter((p) => p.lwd && p.lwd.getTime() < today && p.lwd.getTime() >= today - 30 * DAY_MS).length
  const newThisWeek = active.filter((p) => p.firstSeenAt.getTime() >= now.getTime() - 7 * DAY_MS).length

  const groups = new Map((await getActiveOpportunityGroups()).map((g) => [g.groupKey, g]))
  const people = active
    .map((p) => ({ p, matches: p.opportunityMatches.filter((m) => groups.has(m.groupKey)).slice(0, 3) }))
    .filter((x) => x.matches.length > 0)
    .sort((a, b) => b.matches[0].score - a.matches[0].score)

  const base = process.env.NEXTAUTH_URL ?? ''
  const link = `${base}/redeployment?tab=matches`
  const stat = (label: string, n: number) =>
    `<td style="padding:10px 14px;background:${CREAM};border-radius:6px;font-family:${FONT};"><div style="font-size:20px;font-weight:700;color:${CHARCOAL};">${n}</div><div style="font-size:11px;color:#5E5751;">${label}</div></td>`

  const personBlocks = people.map(({ p, matches }) => {
    const name = p.candidate ? `${p.candidate.firstName} ${p.candidate.lastName}` : [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ')
    const chip = lwdChip(p.lwd, now)
    const rows = matches.map((m) => {
      const g = groups.get(m.groupKey)!
      const isNew = !lastDigestAt || m.createdAt > lastDigestAt
      return `<tr>
        <td style="padding:6px 8px;font-family:${FONT};font-size:13px;font-weight:700;color:${CHARCOAL};vertical-align:top;">${m.score}</td>
        <td style="padding:6px 8px;font-family:${FONT};font-size:13px;color:${CHARCOAL};vertical-align:top;">
          ${esc(g.designation)}${isNew ? ` <span style="background:${LIME};color:${CHARCOAL};font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;">New</span>` : ''}${m.status === 'PROPOSED' ? ` <span style="background:${CREAM};color:${CHARCOAL};font-size:10px;padding:1px 6px;border-radius:3px;">Proposed</span>` : ''}
          <div style="font-size:12px;color:#5E5751;">${esc(g.accountName ?? g.groupAccountName ?? '—')} · ${esc(g.location)} · ${esc(g.workMode ?? 'Unknown')} · ${g.openings} opening${g.openings === 1 ? '' : 's'}</div>
          <div style="font-size:11px;color:#8A847D;">Req ${esc(g.requisitionIds.join(', '))} · Onboarding ${fmtDate(g.plannedOnboardingDate)}</div>
        </td>
      </tr>`
    }).join('')
    return `<div style="margin:0 0 18px 0;border:1px solid #E5E0D8;border-radius:8px;padding:12px 14px;">
      <div style="font-family:${FONT};font-size:14px;font-weight:700;color:${CHARCOAL};">${esc(name)}
        ${chip ? `<span style="font-weight:400;font-size:11px;background:${chip.tone === 'soon' ? '#FEF3C7' : '#F3F4F6'};color:${chip.tone === 'soon' ? '#92400E' : '#4B5563'};padding:1px 6px;border-radius:9px;margin-left:6px;">${esc(chip.label)}</span>` : ''}
      </div>
      <div style="font-family:${FONT};font-size:12px;color:#5E5751;margin-bottom:6px;">${esc(p.lastJobTitle ?? '—')}${p.grade ? ` · Grade ${esc(p.grade)}` : ''}</div>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">${rows}</table>
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
    <h2 style="font-size:15px;margin:0 0 10px 0;color:${CHARCOAL};">Top global matches (score ≥ ${settings.minScore})</h2>
    ${personBlocks || `<p style="font-size:13px;color:#5E5751;">No matches at or above ${settings.minScore} this week.</p>`}
    <p style="margin:20px 0 0 0;"><a href="${esc(link)}" style="display:inline-block;background:${CHARCOAL};color:${LIME};font-weight:700;font-size:13px;padding:9px 16px;border-radius:4px;text-decoration:none;">Open Global matches</a></p>
  </div></body></html>`
  return { subject: `Redeployment digest — ${people.length} ${people.length === 1 ? 'person' : 'people'} with matches`, html, people: people.length }
}

// Monday send: only to REDEPLOYMENT_DIGEST_RECIPIENTS (nothing when empty); "New" tags compare with the last send
export async function sendRedeploymentDigest(): Promise<{ sent: number }> {
  const { digestRecipients } = await getGlobalOpportunitySettings()
  if (digestRecipients.length === 0) {
    console.log('[redeployment-digest] No recipients configured, not sent')
    return { sent: 0 }
  }
  const now = new Date()
  const { subject, html } = await buildRedeploymentDigest(now)
  for (const to of digestRecipients) await sendEmailViaSystemGmail({ to, subject, html })
  await db.systemSettings.upsert({
    where: { key: LAST_DIGEST_KEY },
    update: { value: now.toISOString() },
    create: { key: LAST_DIGEST_KEY, value: now.toISOString(), description: 'Last Monday Redeployment digest (managed automatically).' },
  })
  return { sent: digestRecipients.length }
}

// Test send to one address; does not move the "New since last digest" marker
export async function sendTestRedeploymentDigest(to: string): Promise<void> {
  const { subject, html } = await buildRedeploymentDigest()
  await sendEmailViaSystemGmail({ to, subject: `[Test] ${subject}`, html })
}
