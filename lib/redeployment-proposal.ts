import { db } from './db'
import { resolveEmailTemplate } from './email-resolver'
import { downloadFileFromDrive, getDriveFileMeta } from './google'
import { sendEmailViaGmailWithAttachment } from './email'
import { getActiveOpportunityGroups } from './redeployment-matching'
import {
  REDEPLOYMENT_PROPOSAL_KEY, REDEPLOYMENT_PROPOSAL_DEFAULT_SUBJECT, REDEPLOYMENT_PROPOSAL_DEFAULT_BODY,
} from './redeployment-proposal-template'

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

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

async function loadMatch(matchId: string) {
  const match = await db.opportunityMatch.findUnique({
    where: { id: matchId },
    include: {
      redeploymentProfile: {
        select: {
          id: true, firstName: true, lastName: true, preferredName: true, lastJobTitle: true, lastClient: true, grade: true,
          yearsExperience: true, primarySkill: true, subSkill: true, subLocation: true, lwd: true, sourceCvDriveFileId: true, cvFileName: true,
          candidate: { select: { firstName: true, lastName: true, skills: true, country: true } },
        },
      },
    },
  })
  if (!match || match.targetType !== 'GLOBAL_GROUP' || !match.groupKey) return null
  const group = (await getActiveOpportunityGroups()).find((g) => g.groupKey === match.groupKey) ?? null
  return group ? { match, group, profile: match.redeploymentProfile } : null
}

export type ProposalContext = NonNullable<Awaited<ReturnType<typeof loadMatch>>>

// Rendered subject/body (template override or English default) + CV info + recipient suggestions
export async function buildProposalDraft(matchId: string, senderName: string) {
  const ctx = await loadMatch(matchId)
  if (!ctx) return null
  const { match, group, profile } = ctx
  const c = profile.candidate
  const personName = c ? `${c.firstName} ${c.lastName}`.trim() : [profile.preferredName || profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const skills = [...new Set([profile.primarySkill, profile.subSkill, ...(c?.skills ?? [])].filter((s): s is string => !!s))].slice(0, 8)
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const availability = profile.lwd && profile.lwd.getTime() > today.getTime()
    ? `Available from ${profile.lwd.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'Available now'
  const vars: Record<string, string> = {
    personName,
    lastRole: profile.lastJobTitle ?? '—',
    lastClient: profile.lastClient ?? '—',
    grade: profile.grade ?? '—',
    yearsExperience: profile.yearsExperience != null ? `${profile.yearsExperience} years` : '—',
    skills: skills.join(', ') || '—',
    availability,
    personLocation: profile.subLocation ?? c?.country ?? '—',
    strengths: match.strengths.length > 0 ? match.strengths.map((s) => `- ${s}`).join('\n') : '-',
    designation: group.designation,
    account: group.accountName ?? group.groupAccountName ?? '—',
    opportunityLocation: group.location,
    workMode: group.workMode ?? 'Unknown work mode',
    requisitionIds: group.requisitionIds.join(', '),
    senderName,
  }
  const { subject, html: body } = await resolveEmailTemplate(REDEPLOYMENT_PROPOSAL_KEY, REDEPLOYMENT_PROPOSAL_DEFAULT_SUBJECT, REDEPLOYMENT_PROPOSAL_DEFAULT_BODY, vars)

  let cvName: string | null = null
  if (profile.sourceCvDriveFileId) {
    cvName = await getDriveFileMeta(profile.sourceCvDriveFileId).then((m) => m.name).catch(() => profile.cvFileName?.split('/').pop() ?? null)
  }
  const previous = await db.opportunityProposal.findMany({ select: { toEmails: true, ccEmails: true }, orderBy: { sentAt: 'desc' }, take: 300 })
  const suggestions = [...new Set(previous.flatMap((p) => [...p.toEmails, ...p.ccEmails]))].slice(0, 100)
  return { subject, body, cvName, hasCv: !!profile.sourceCvDriveFileId, suggestions, personName }
}

// Roster CV with its original name (service account, Shared Drives supported)
export async function loadRosterCv(fileId: string): Promise<{ name: string; mimeType: string; data: Buffer }> {
  const [meta, data] = await Promise.all([getDriveFileMeta(fileId), downloadFileFromDrive(fileId)])
  return { ...meta, data }
}

async function recordProposal(ctx: ProposalContext, userId: string, msg: { to: string[]; cc: string[]; subject: string; body: string; attachmentName: string | null; method: 'GMAIL_API' | 'MANUAL'; gmailMessageId: string | null }) {
  const now = new Date()
  await db.$transaction([
    db.opportunityProposal.create({
      data: {
        matchId: ctx.match.id, redeploymentProfileId: ctx.profile.id, groupKey: ctx.group.groupKey,
        toEmails: msg.to, ccEmails: msg.cc, subject: msg.subject, body: msg.body, attachmentName: msg.attachmentName,
        sentById: userId, sentAt: now, gmailMessageId: msg.gmailMessageId, method: msg.method,
      },
    }),
    db.opportunityMatch.update({
      where: { id: ctx.match.id },
      data: { status: 'PROPOSED', proposedAt: now, proposedById: userId, dismissedAt: null },
    }),
  ])
}

// Sends from the user's Gmail with the roster CV attached; records the proposal and marks the match PROPOSED only
// after Gmail accepted the message. Gmail errors (incl. not connected / expired) propagate unchanged.
export async function sendProposal(matchId: string, userId: string, msg: { to: string[]; cc: string[]; subject: string; body: string }) {
  const ctx = await loadMatch(matchId)
  if (!ctx) throw new Error('This opportunity is no longer open')
  const cv = ctx.profile.sourceCvDriveFileId ? await loadRosterCv(ctx.profile.sourceCvDriveFileId) : null
  const sent = await sendEmailViaGmailWithAttachment(userId, { to: msg.to, cc: msg.cc, subject: msg.subject, html: textToHtml(msg.body), attachment: cv })
  await recordProposal(ctx, userId, { ...msg, attachmentName: cv?.name ?? null, method: 'GMAIL_API', gmailMessageId: sent.messageId })
}

// "I sent it" after the Open-in-Gmail fallback
export async function recordManualProposal(matchId: string, userId: string, msg: { to: string[]; cc: string[]; subject: string; body: string }) {
  const ctx = await loadMatch(matchId)
  if (!ctx) throw new Error('This opportunity is no longer open')
  await recordProposal(ctx, userId, { ...msg, attachmentName: null, method: 'MANUAL', gmailMessageId: null })
}
