import cron from 'node-cron'
import { db } from './db'
import { sendEmailViaSystemGmail } from './email'
import type { Stage, InterviewDecision } from '@prisma/client'

// Railway containers run UTC. 11:00 UTC = 08:00 Montevideo (UTC-3, no DST in winter;
// UTC-2 in summer — adjust schedule seasonally if needed, or use a timezone-aware cron lib).
const CRON_SCHEDULE = '0 11 * * *'

const DAY_MAP: Record<number, string> = {
  0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT',
}

const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  TECHNICAL_INTERVIEW: 'Technical Interview',
  MANAGER_INTERVIEW: 'Manager Interview',
  CLIENT_INTERVIEW: 'Client Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

const DECISION_LABELS: Record<InterviewDecision, string> = {
  ADVANCE: 'Advance',
  REJECT: 'Reject',
  HOLD: 'Hold',
}

const STAGE_SEQUENCE: Stage[] = [
  'APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW',
  'CLIENT_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED',
]

function daysAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function runReportingCron() {
  const today = DAY_MAP[new Date().getDay()]

  const positions = await db.position.findMany({
    where: {
      deletedAt: null,
      status: 'OPEN',
      reportingDays: { has: today },
      reportingEmails: { isEmpty: false },
    },
    include: {
      candidatePositions: {
        where: { candidate: { deletedAt: null } },
        include: {
          candidate: { select: { firstName: true, lastName: true } },
          stageHistory: {
            orderBy: { movedAt: 'desc' },
          },
          interviews: {
            where: { decision: { not: null } },
            select: {
              stage: true,
              decision: true,
              decidedAt: true,
              roundLabel: true,
            },
            orderBy: { decidedAt: 'desc' },
          },
        },
      },
    },
  })

  if (positions.length === 0) {
    console.log('[reporting-cron] No positions scheduled for today, skipping')
    return
  }

  const systemAccount = await db.systemEmailAccount.findUnique({ where: { purpose: 'system_notifications' } })
  if (!systemAccount?.refreshToken) {
    console.warn('[reporting-cron] Skipped — no system Gmail account connected. Connect one in Settings to enable reporting emails.')
    return
  }

  for (const position of positions) {
    // lastReportSentAt = null means this is the first-ever report for this position.
    // In that case we skip the movements section rather than fabricating a 24h window,
    // since the cron may have been broken for days and the window would be misleading.
    const lastSentAt = position.lastReportSentAt ?? null

    let allEmailsOk = true
    try {
      const html = buildReportEmailHtml(position, lastSentAt)
      const subject = `TalentOS Update: ${position.title} (${position.client}) — ${formatDate(new Date())}`
      for (const email of position.reportingEmails) {
        await sendEmailViaSystemGmail({ to: email, subject, html })
        console.log(`[reporting-cron] Sent report for position "${position.title}" to ${email}`)
      }
    } catch (err) {
      console.error(`[reporting-cron] Failed for position ${position.id}:`, err)
      allEmailsOk = false
    }

    // Only advance the timestamp when every recipient was reached successfully.
    // If sending failed we keep the old lastReportSentAt so the next run still
    // captures the full gap.
    if (allEmailsOk) {
      await db.position.update({
        where: { id: position.id },
        data: { lastReportSentAt: new Date() },
      })
    }
  }
}

let cronStarted = false

export function startReportingCron() {
  if (cronStarted) {
    console.log('[reporting-cron] Already started, skipping duplicate registration')
    return
  }
  cronStarted = true
  cron.schedule(CRON_SCHEDULE, runReportingCron)
  console.log(`[reporting-cron] Scheduled at ${CRON_SCHEDULE} UTC (≈08:00 Montevideo)`)
}

type StageHistoryEntry = {
  movedAt: Date
  toStage: Stage
  fromStage: Stage | null
}

type InterviewEntry = {
  stage: Stage
  decision: InterviewDecision | null
  decidedAt: Date | null
  roundLabel: string
}

type CandidatePositionFull = {
  id: string
  stage: Stage
  status: string
  createdAt: Date
  candidate: { firstName: string; lastName: string }
  stageHistory: StageHistoryEntry[]
  interviews: InterviewEntry[]
}

type PositionFull = {
  id: string
  title: string
  client: string
  lastReportSentAt: Date | null
  candidatePositions: CandidatePositionFull[]
}

function buildReportEmailHtml(position: PositionFull, lastSentAt: Date | null): string {
  const allCPs = position.candidatePositions
  const total = allCPs.length
  // Active = not rejected or withdrawn from pipeline
  const activeCPs = allCPs.filter((cp) => cp.status === 'ACTIVE' || cp.status === 'HIRED')
  const notMovingForward = total - activeCPs.length

  const tdLabel = 'padding:4px 12px 4px 0;color:#6b7280;vertical-align:top;'
  const tdValue = 'padding:4px 0;font-weight:600;color:#111827;vertical-align:top;'

  // ── Movements section ────────────────────────────────────────────────────
  let movementsHtml: string
  if (!lastSentAt) {
    // First-ever report: no baseline to compare against
    movementsHtml = `<p style="color:#6b7280;font-size:14px;margin:0;">No previous report on record — movements tracking starts from this send.</p>`
  } else {
    // Only report new active candidates (not immediately rejected/withdrawn)
    const newCandidates = activeCPs.filter((cp) => cp.createdAt >= lastSentAt)

    const stageChanges: { name: string; from: Stage; to: Stage }[] = []
    for (const cp of allCPs) {
      const name = `${cp.candidate.firstName} ${cp.candidate.lastName}`
      for (const h of cp.stageHistory) {
        if (h.movedAt >= lastSentAt && h.fromStage) {
          stageChanges.push({ name, from: h.fromStage, to: h.toStage })
        }
      }
    }

    const decisions: { name: string; decision: InterviewDecision; roundLabel: string }[] = []
    for (const cp of allCPs) {
      const name = `${cp.candidate.firstName} ${cp.candidate.lastName}`
      for (const iv of cp.interviews) {
        if (iv.decision && iv.decidedAt && iv.decidedAt >= lastSentAt) {
          decisions.push({ name, decision: iv.decision, roundLabel: iv.roundLabel })
        }
      }
    }

    const hasMovements = newCandidates.length > 0 || stageChanges.length > 0 || decisions.length > 0
    const sinceLabel = `since ${formatDate(lastSentAt)}`

    if (!hasMovements) {
      movementsHtml = `<p style="color:#6b7280;font-size:14px;margin:0;">No changes ${sinceLabel}.</p>`
    } else {
      const parts: string[] = []

      if (newCandidates.length > 0) {
        const rows = newCandidates
          .map((cp) => `<li style="margin:2px 0;color:#374151;">${cp.candidate.firstName} ${cp.candidate.lastName} <span style="color:#6b7280;">(${STAGE_LABELS[cp.stage]})</span></li>`)
          .join('')
        parts.push(`<p style="margin:0 0 4px;font-weight:600;color:#111827;font-size:13px;">New candidates added:</p><ul style="margin:0 0 12px;padding-left:20px;">${rows}</ul>`)
      }

      if (stageChanges.length > 0) {
        const rows = stageChanges
          .map((sc) => `<li style="margin:2px 0;color:#374151;">${sc.name}: <span style="color:#6b7280;">${STAGE_LABELS[sc.from]} → ${STAGE_LABELS[sc.to]}</span></li>`)
          .join('')
        parts.push(`<p style="margin:0 0 4px;font-weight:600;color:#111827;font-size:13px;">Stage changes:</p><ul style="margin:0 0 12px;padding-left:20px;">${rows}</ul>`)
      }

      if (decisions.length > 0) {
        const rows = decisions
          .map((d) => `<li style="margin:2px 0;color:#374151;">${d.name}: <span style="color:#6b7280;">${DECISION_LABELS[d.decision]} (${d.roundLabel})</span></li>`)
          .join('')
        parts.push(`<p style="margin:0 0 4px;font-weight:600;color:#111827;font-size:13px;">Decisions made:</p><ul style="margin:0 0 12px;padding-left:20px;">${rows}</ul>`)
      }

      movementsHtml = parts.join('')
    }
  }

  // ── Stage breakdown with candidate names + aging ─────────────────────────
  // Only include active/hired candidates in the breakdown
  const byStage = new Map<Stage, CandidatePositionFull[]>()
  for (const cp of activeCPs) {
    const arr = byStage.get(cp.stage) ?? []
    arr.push(cp)
    byStage.set(cp.stage, arr)
  }

  const stageRowsHtml = STAGE_SEQUENCE
    .filter((s) => byStage.has(s))
    .map((s) => {
      const cps = byStage.get(s)!
      const stageLabel = STAGE_LABELS[s]
      const count = cps.length

      const candidateItems = cps.map((cp) => {
        const name = `${cp.candidate.firstName} ${cp.candidate.lastName}`
        // Most recent StageHistory entry where toStage matches current stage = when they entered it
        const entryRecord = cp.stageHistory.find((h) => h.toStage === cp.stage)
        const days = entryRecord ? daysAgo(entryRecord.movedAt) : daysAgo(cp.createdAt)
        const aging = days === 0 ? 'today' : days === 1 ? '1 day in stage' : `${days} days in stage`
        return `<li style="margin:2px 0;color:#374151;">${name} <span style="color:#9ca3af;font-size:13px;">— ${aging}</span></li>`
      }).join('')

      return `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">
            <span style="font-weight:600;color:#111827;">${stageLabel}</span>
            <span style="color:#6b7280;font-size:13px;margin-left:4px;">(${count})</span>
            <ul style="margin:4px 0 0;padding-left:18px;">${candidateItems}</ul>
          </td>
        </tr>`
    })
    .join('')

  const movementsHeading = lastSentAt
    ? `Movements since last report <span style="font-weight:400;font-size:12px;color:#9ca3af;">(since ${formatDate(lastSentAt)})</span>`
    : 'Movements since last report'

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:24px;">

<h2 style="margin:0 0 2px;">${position.title}</h2>
<p style="margin:0 0 4px;color:#6b7280;">Client: ${position.client}</p>
<p style="margin:0 0 24px;font-size:13px;color:#9ca3af;">${formatDate(new Date())}</p>

<table style="border-collapse:collapse;margin-bottom:20px;">
  <tr><td style="${tdLabel}">Total candidates</td><td style="${tdValue}">${total} <span style="font-weight:400;color:#6b7280;">(Active: ${activeCPs.length})</span></td></tr>
  <tr><td style="${tdLabel}">Active in pipeline</td><td style="${tdValue}">${activeCPs.length}</td></tr>
</table>

<h3 style="margin:0 0 10px;font-size:14px;color:#374151;text-transform:uppercase;letter-spacing:.05em;border-top:1px solid #e5e7eb;padding-top:16px;">${movementsHeading}</h3>
${movementsHtml}

<h3 style="margin:20px 0 10px;font-size:14px;color:#374151;text-transform:uppercase;letter-spacing:.05em;border-top:1px solid #e5e7eb;padding-top:16px;">Pipeline Breakdown</h3>
<table style="border-collapse:collapse;width:100%;">
  ${stageRowsHtml}
</table>

${notMovingForward > 0 ? `<p style="margin-top:16px;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:12px;">Not moving forward: <strong>${notMovingForward} candidate${notMovingForward === 1 ? '' : 's'}</strong> (rejected or withdrawn)</p>` : ''}

<p style="margin-top:24px;font-size:12px;color:#9ca3af;">Sent by TalentOS · View full details in the app.</p>
</body></html>`
}
