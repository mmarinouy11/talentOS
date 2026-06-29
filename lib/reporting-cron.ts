import cron from 'node-cron'
import { db } from './db'
import { sendEmail } from './email'
import type { Stage } from '@prisma/client'

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

export function startReportingCron() {
  cron.schedule(CRON_SCHEDULE, async () => {
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
          },
        },
      },
    })

    for (const position of positions) {
      try {
        const html = buildReportEmailHtml(position)
        for (const email of position.reportingEmails) {
          const result = await sendEmail({
            to: email,
            subject: `TalentOS Update: ${position.title} (${position.client})`,
            html,
            template: 'position-report',
          })
          if (!result.success) throw new Error(result.error)
        }
      } catch (err) {
        console.error(`[reporting-cron] Failed for position ${position.id}:`, err)
      }
    }
  })

  console.log(`[reporting-cron] Scheduled at ${CRON_SCHEDULE} UTC (≈08:00 Montevideo)`)
}

function buildReportEmailHtml(position: {
  title: string
  client: string
  candidatePositions: { stage: Stage; candidate: { firstName: string; lastName: string } }[]
}): string {
  const total = position.candidatePositions.length
  const active = position.candidatePositions.filter(
    (cp) => cp.stage !== 'HIRED' && cp.stage !== 'REJECTED'
  ).length

  const byStage = position.candidatePositions.reduce<Partial<Record<Stage, number>>>((acc, cp) => {
    acc[cp.stage] = (acc[cp.stage] ?? 0) + 1
    return acc
  }, {})

  const stageOrder: Stage[] = [
    'APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'MANAGER_INTERVIEW',
    'CLIENT_INTERVIEW', 'OFFER', 'HIRED', 'REJECTED',
  ]

  const stageRows = stageOrder
    .filter((s) => byStage[s])
    .map((s) => `<tr><td style="padding:4px 12px 4px 0;color:#374151;">${STAGE_LABELS[s]}</td><td style="padding:4px 0;font-weight:600;color:#111827;">${byStage[s]}</td></tr>`)
    .join('')

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111827;max-width:600px;margin:0 auto;padding:24px;">
<h2 style="margin:0 0 4px;">${position.title}</h2>
<p style="margin:0 0 20px;color:#6b7280;">Client: ${position.client}</p>

<table style="border-collapse:collapse;margin-bottom:20px;">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Total candidates</td><td style="font-weight:600;">${total}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Active in pipeline</td><td style="font-weight:600;">${active}</td></tr>
</table>

<h3 style="margin:0 0 8px;font-size:14px;color:#374151;text-transform:uppercase;letter-spacing:.05em;">By Stage</h3>
<table style="border-collapse:collapse;">
  ${stageRows}
</table>

<p style="margin-top:24px;font-size:12px;color:#9ca3af;">Sent by TalentOS · View full details in the app.</p>
</body></html>`
}
