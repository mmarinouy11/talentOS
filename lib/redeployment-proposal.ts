import { randomUUID } from 'crypto'
import { db } from './db'
import { downloadFileFromDrive, getDriveFileMeta } from './google'
import { sendEmailViaGmailWithAttachment } from './email'
import { getActiveOpportunityGroups, type OpportunityGroup } from './redeployment-matching'
import {
  REDEPLOYMENT_PROPOSAL_KEY, REDEPLOYMENT_PROPOSAL_DEFAULT_SUBJECT, REDEPLOYMENT_PROPOSAL_DEFAULT_BODY,
  templateSupportsSeveralPeople,
} from './redeployment-proposal-template'

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
// Gmail rejects messages over 25 MB; base64 adds ~33%, so the attachments themselves stay under 20 MB
export const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024

export function parseEmailList(raw: string | string[] | null | undefined): { emails: string[]; invalid: string[] } {
  const parts = (Array.isArray(raw) ? raw : (raw ?? '').split(/[,;\n]/)).map((s) => s.trim()).filter(Boolean)
  const emails = [...new Set(parts.filter((p) => EMAIL_RE.test(p)).map((p) => p.toLowerCase()))]
  return { emails, invalid: parts.filter((p) => !EMAIL_RE.test(p)) }
}

// Plain-text body → simple HTML (escaped, line breaks kept)
export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap;">${esc}</div>`
}

const profileSelect = {
  id: true, firstName: true, lastName: true, preferredName: true, lastJobTitle: true, lastClient: true, grade: true,
  yearsExperience: true, primarySkill: true, subSkill: true, subLocation: true, lwd: true, sourceCvDriveFileId: true, cvFileName: true,
  candidate: { select: { firstName: true, lastName: true, skills: true, country: true } },
} as const

// All matches must be global-opportunity matches of the same, still active group (one email = one opportunity)
async function loadMatches(matchIds: string[]) {
  const ids = [...new Set(matchIds)]
  if (ids.length === 0) throw new Error('Select at least one person')
  const matches = await db.opportunityMatch.findMany({
    where: { id: { in: ids } },
    include: { redeploymentProfile: { select: profileSelect } },
  })
  if (matches.length !== ids.length) throw new Error('Some of the selected matches no longer exist')
  const keys = new Set(matches.map((m) => (m.targetType === 'GLOBAL_GROUP' ? m.groupKey : null)))
  if (keys.has(null) || keys.size !== 1) throw new Error('All selected people must be matched to the same global opportunity')
  const groupKey = [...keys][0]!
  const group = (await getActiveOpportunityGroups()).find((g) => g.groupKey === groupKey)
  if (!group) throw new Error('This opportunity is no longer open')
  // Keep the caller's order (the UI sorts by score)
  const byId = new Map(matches.map((m) => [m.id, m]))
  return { group, matches: ids.map((id) => byId.get(id)!) }
}

type LoadedMatch = Awaited<ReturnType<typeof loadMatches>>['matches'][number]

function personName(m: LoadedMatch): string {
  const p = m.redeploymentProfile
  return p.candidate ? `${p.candidate.firstName} ${p.candidate.lastName}`.trim() : [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ')
}

function personVars(m: LoadedMatch): Record<string, string> {
  const p = m.redeploymentProfile
  const c = p.candidate
  const skills = [...new Set([p.primarySkill, p.subSkill, ...(c?.skills ?? [])].filter((s): s is string => !!s))].slice(0, 8)
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const availability = p.lwd && p.lwd.getTime() > today.getTime()
    ? `Available from ${p.lwd.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'Available now'
  return {
    personName: personName(m),
    lastRole: p.lastJobTitle ?? '—',
    lastClient: p.lastClient ?? '—',
    grade: p.grade ?? '—',
    yearsExperience: p.yearsExperience != null ? `${p.yearsExperience} years` : '—',
    skills: skills.join(', ') || '—',
    availability,
    personLocation: p.subLocation ?? c?.country ?? '—',
    strengths: m.strengths.length > 0 ? m.strengths.map((s) => `- ${s}`).join('\n') : '-',
  }
}

function personBlock(v: Record<string, string>): string {
  return [
    v.personName,
    `- Last role: ${v.lastRole} at ${v.lastClient}`,
    `- Grade: ${v.grade}`,
    `- Experience: ${v.yearsExperience}`,
    `- Key skills: ${v.skills}`,
    `- Location: ${v.personLocation}`,
    `- ${v.availability}`,
    'Why they are a good fit:',
    v.strengths,
  ].join('\n')
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

function groupVars(group: OpportunityGroup, senderName: string): Record<string, string> {
  return {
    designation: group.designation,
    account: group.accountName ?? group.groupAccountName ?? '—',
    opportunityLocation: group.location,
    workMode: group.workMode ?? 'Unknown work mode',
    requisitionIds: group.requisitionIds.join(', '),
    senderName,
  }
}

const fill = (t: string, vars: Record<string, string>) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v), t)

// Rendered subject/body for one or more people. A stored custom template without {{peopleSummary}} is used
// as-is for one person; for several people the default is used and `templateNotice` says why.
async function renderProposal(group: OpportunityGroup, matches: LoadedMatch[], senderName: string) {
  const override = await db.systemEmailTemplate.findUnique({ where: { key: REDEPLOYMENT_PROPOSAL_KEY } }).catch(() => null)
  const customSubject = override?.subject || null
  const customBody = override?.htmlBody || null
  const hasCustom = !!(customSubject || customBody)
  const several = matches.length > 1
  const useCustom = hasCustom && (!several || templateSupportsSeveralPeople(customSubject, customBody))
  const subjectT = (useCustom && customSubject) || REDEPLOYMENT_PROPOSAL_DEFAULT_SUBJECT
  const bodyT = (useCustom && customBody) || REDEPLOYMENT_PROPOSAL_DEFAULT_BODY

  const people = matches.map(personVars)
  const names = people.map((p) => p.personName)
  const vars: Record<string, string> = {
    ...groupVars(group, senderName),
    ...(several ? {} : people[0]),
    peopleSummary: people.map(personBlock).join('\n\n'),
    peopleCount: several ? `${people.length} candidates` : names[0],
    peopleNames: joinNames(names),
  }
  return {
    subject: fill(subjectT, vars),
    body: fill(bodyT, vars),
    templateNotice: hasCustom && several && !useCustom
      ? 'Your custom proposal template has no {{peopleSummary}} placeholder, so the default template is used for several people. Add {{peopleSummary}} in Settings → Email templates.'
      : null,
  }
}

async function cvInfo(m: LoadedMatch) {
  const p = m.redeploymentProfile
  if (!p.sourceCvDriveFileId) return { cvName: null, cvSize: null, hasCv: false }
  const meta = await getDriveFileMeta(p.sourceCvDriveFileId).catch(() => null)
  return { cvName: meta?.name ?? p.cvFileName?.split('/').pop() ?? null, cvSize: meta?.size ?? null, hasCv: true }
}

// Composer data: rendered email, each person's CV (name/size) and recipient suggestions
export async function buildProposalDraft(matchIds: string[], senderName: string) {
  const { group, matches } = await loadMatches(matchIds)
  const rendered = await renderProposal(group, matches, senderName)
  const people = await Promise.all(matches.map(async (m) => ({
    matchId: m.id, profileId: m.redeploymentProfileId, personName: personName(m), ...(await cvInfo(m)),
  })))
  const totalCvBytes = people.reduce((n, p) => n + (p.cvSize ?? 0), 0)
  const previous = await db.opportunityProposal.findMany({ select: { toEmails: true, ccEmails: true }, orderBy: { sentAt: 'desc' }, take: 300 })
  const suggestions = [...new Set(previous.flatMap((p) => [...p.toEmails, ...p.ccEmails]))].slice(0, 100)
  return { ...rendered, people, totalCvBytes, maxAttachmentBytes: MAX_ATTACHMENTS_BYTES, designation: group.designation, suggestions }
}

// Roster CV with its original name (service account, Shared Drives supported)
export async function loadRosterCv(fileId: string): Promise<{ name: string; mimeType: string; data: Buffer }> {
  const [meta, data] = await Promise.all([getDriveFileMeta(fileId), downloadFileFromDrive(fileId)])
  return { name: meta.name, mimeType: meta.mimeType, data }
}

// Two people's CVs may share a file name: keep both by numbering the later one
function uniqueNames<T extends { name: string }>(files: T[]): T[] {
  const used = new Set<string>()
  return files.map((f) => {
    let name = f.name
    for (let i = 2; used.has(name.toLowerCase()); i++) name = f.name.replace(/(\.[^.]+)?$/, ` (${i})$1`)
    used.add(name.toLowerCase())
    return { ...f, name }
  })
}

type Msg = { to: string[]; cc: string[]; subject: string; body: string }

// One OpportunityProposal per person (same batchId and Gmail id) and every match PROPOSED, in one transaction
async function recordProposals(group: OpportunityGroup, items: { match: LoadedMatch; attachmentName: string | null }[], userId: string, msg: Msg & { method: 'GMAIL_API' | 'MANUAL'; gmailMessageId: string | null }) {
  const now = new Date()
  const batchId = randomUUID()
  await db.$transaction(items.flatMap(({ match, attachmentName }) => [
    db.opportunityProposal.create({
      data: {
        matchId: match.id, redeploymentProfileId: match.redeploymentProfileId, groupKey: group.groupKey,
        toEmails: msg.to, ccEmails: msg.cc, subject: msg.subject, body: msg.body, attachmentName,
        sentById: userId, sentAt: now, gmailMessageId: msg.gmailMessageId, method: msg.method, batchId,
      },
    }),
    db.opportunityMatch.update({
      where: { id: match.id },
      data: { status: 'PROPOSED', proposedAt: now, proposedById: userId, dismissedAt: null },
    }),
  ]))
  return batchId
}

// Sends ONE email from the user's Gmail with every selected person's roster CV attached; records the proposals
// only after Gmail accepted it. Over 20 MB of attachments → refused before sending. Gmail errors propagate.
export async function sendProposal(matchIds: string[], userId: string, msg: Msg) {
  const { group, matches } = await loadMatches(matchIds)
  const loaded = await Promise.all(matches.map(async (m) => ({
    match: m,
    cv: m.redeploymentProfile.sourceCvDriveFileId ? await loadRosterCv(m.redeploymentProfile.sourceCvDriveFileId) : null,
  })))
  const total = loaded.reduce((n, l) => n + (l.cv?.data.length ?? 0), 0)
  if (total > MAX_ATTACHMENTS_BYTES) {
    throw new AttachmentsTooLargeError(`The CVs add up to ${(total / 1024 / 1024).toFixed(1)} MB (limit 20 MB). Select fewer people and send several emails.`)
  }
  const attachments = uniqueNames(loaded.filter((l) => l.cv).map((l) => ({ ...l.cv!, matchId: l.match.id })))
  const sent = await sendEmailViaGmailWithAttachment(userId, {
    to: msg.to, cc: msg.cc, subject: msg.subject, html: textToHtml(msg.body),
    attachments: attachments.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
  })
  const nameByMatch = new Map(attachments.map((a) => [a.matchId, a.name]))
  return recordProposals(group, matches.map((m) => ({ match: m, attachmentName: nameByMatch.get(m.id) ?? null })), userId, { ...msg, method: 'GMAIL_API', gmailMessageId: sent.messageId })
}

export class AttachmentsTooLargeError extends Error {}

// "I sent it" after the Open-in-Gmail fallback
export async function recordManualProposal(matchIds: string[], userId: string, msg: Msg) {
  const { group, matches } = await loadMatches(matchIds)
  return recordProposals(group, matches.map((m) => ({ match: m, attachmentName: null })), userId, { ...msg, method: 'MANUAL', gmailMessageId: null })
}
