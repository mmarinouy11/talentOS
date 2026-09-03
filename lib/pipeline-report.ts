export interface PipelineCandidate {
  cpId: string
  name: string
  days: number
}

export interface PipelineStage {
  stage: string
  label: string
  count: number
  candidates: PipelineCandidate[]
}

export interface PipelineActivity {
  newCandidates: { name: string; source: string }[]
  stageChanges: { name: string; from: string; to: string }[]
  decisions: { name: string; decision: string; stage: string; notes: string | null }[]
}

export interface PipelinePosition {
  id: string
  title: string
  recruiter: string
  headcount: number
  pipelineStages: PipelineStage[]
  activity: PipelineActivity
  notMovingForward: number
  totalProcessed: number
}

export interface PipelineClient {
  client: string
  positions: PipelinePosition[]
}

export interface PipelineAtAGlance {
  openPositions: number
  totalHeadcount: number
  activeCandidates: number
  offerCount: number
  clientCount: number
  managerCount: number
  techCount: number
  interviewsToday: number
}

export interface PipelinePeriodHighlights {
  interviewsConducted: number
  interviewsByStage: { stage: string; label: string; count: number }[]
  candidatesAdvanced: number
  newCandidates: number
  newCandidatePositions: number
  movedToOffer: number
  notMovingForward: number
  filledThisPeriod: number
}

export interface PipelineReportData {
  from: string
  to: string
  generatedAt: string
  summary: {
    totalPositions: number
    totalActive: number
    totalHeadcount: number
    interviewsToday: number
  }
  atAGlance: PipelineAtAGlance
  periodHighlights: PipelinePeriodHighlights
  clients: PipelineClient[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const STAGE_DISPLAY: Record<string, string> = {
  APPLIED: 'Pipeline',
}

function stageLabel(raw: string): string {
  return STAGE_DISPLAY[raw] ?? raw
}

const SUMMARY_STAGES: { key: string; label: string }[] = [
  { key: 'OFFER', label: 'Off' },
  { key: 'CLIENT_INTERVIEW', label: 'Cli' },
  { key: 'MANAGER_INTERVIEW', label: 'Mgr' },
  { key: 'TECHNICAL_INTERVIEW', label: 'Tech' },
  { key: 'SCREENING', label: 'Scr' },
  { key: 'APPLIED', label: 'Pipe' },
]

const LIME = '#8CF000'

function buildHeaderSection(data: PipelineReportData, _emailMode: boolean): string {
  const from = fmtDate(data.from)
  const to = fmtDate(data.to)
  const generated = fmtDate(data.generatedAt)
  const ag = data.atAGlance
  const ph = data.periodHighlights

  const advancedTotal = ag.offerCount + ag.clientCount + ag.managerCount + ag.techCount
  const advancedParts = [
    ag.offerCount > 0 ? `${ag.offerCount} Offer` : '',
    ag.clientCount > 0 ? `${ag.clientCount} Client` : '',
    ag.managerCount > 0 ? `${ag.managerCount} Manager` : '',
    ag.techCount > 0 ? `${ag.techCount} Tech` : '',
  ].filter(Boolean)
  const advancedDetail = advancedParts.join(' · ') || 'none'

  const bullets: string[] = []

  if (ph.filledThisPeriod > 0) {
    bullets.push(`✅ ${ph.filledThisPeriod} position${ph.filledThisPeriod !== 1 ? 's' : ''} filled this period`)
  }
  if (ph.movedToOffer > 0) {
    bullets.push(`✉️ ${ph.movedToOffer} candidate${ph.movedToOffer !== 1 ? 's' : ''} moved to Offer`)
  }
  bullets.push(`➡️ ${ph.candidatesAdvanced} candidate${ph.candidatesAdvanced !== 1 ? 's' : ''} advanced to next stage`)
  if (ph.interviewsConducted > 0) {
    const byStage = ph.interviewsByStage
      .filter((s) => s.count > 0)
      .map((s) => `${s.count} ${s.label.toLowerCase()}`)
      .join(', ')
    bullets.push(`📅 ${ph.interviewsConducted} interview${ph.interviewsConducted !== 1 ? 's' : ''} scheduled${byStage ? ` — ${byStage}` : ''}`)
  }
  bullets.push(`🆕 ${ph.newCandidates} new candidate${ph.newCandidates !== 1 ? 's' : ''} added across ${ph.newCandidatePositions} position${ph.newCandidatePositions !== 1 ? 's' : ''}`)
  bullets.push(`❌ ${ph.notMovingForward} candidate${ph.notMovingForward !== 1 ? 's' : ''} not moving forward`)

  const cardStyle = `padding:12px 16px;border:1px solid #e5e7eb;border-radius:6px;vertical-align:top;`

  return `
    <div style="margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #e5e7eb;">
      <div style="border-left:4px solid ${LIME};padding-left:12px;margin-bottom:20px;">
        <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#2F2C29;letter-spacing:.02em;">TENARAI LATAM — PIPELINE REPORT</h1>
        <p style="margin:0;font-size:12px;color:#6b7280;">Generated ${esc(generated)} · Period: ${esc(from)} – ${esc(to)}</p>
      </div>

      <div style="margin-bottom:20px;">
        <h2 style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;">At a Glance</h2>
        <table style="border-collapse:separate;border-spacing:8px;width:100%;">
          <tr>
            <td style="${cardStyle}">
              <div style="font-size:22px;font-weight:700;color:#111827;">${ag.totalHeadcount}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px;">Open Headcount</div>
              <div style="font-size:11px;color:#9ca3af;">across ${ag.openPositions} position${ag.openPositions !== 1 ? 's' : ''}</div>
            </td>
            <td style="${cardStyle}">
              <div style="font-size:22px;font-weight:700;color:#111827;">${ag.activeCandidates}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px;">Active Candidates</div>
              <div style="font-size:11px;color:#9ca3af;">across all positions</div>
            </td>
            <td style="${cardStyle}">
              <div style="font-size:22px;font-weight:700;color:#111827;">${advancedTotal}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px;">Advanced Stages</div>
              <div style="font-size:11px;color:#9ca3af;">${esc(advancedDetail)}</div>
            </td>
            <td style="${cardStyle}">
              <div style="font-size:22px;font-weight:700;color:#111827;">${ag.interviewsToday}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px;">Interviews</div>
              <div style="font-size:11px;color:#9ca3af;">scheduled for today</div>
            </td>
          </tr>
        </table>
      </div>

      <div>
        <h2 style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;">
          Period Highlights <span style="font-weight:400;text-transform:none;letter-spacing:0;">(${esc(from)} – ${esc(to)})</span>
        </h2>
        <ul style="margin:0;padding-left:0;list-style:none;">
          ${bullets.map((b) => `<li style="padding:5px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${esc(b)}</li>`).join('')}
        </ul>
      </div>
    </div>`
}

function buildOverviewTable(data: PipelineReportData, emailMode: boolean): string {
  if (data.clients.length === 0) return ''

  const colCount = SUMMARY_STAGES.length + 4 // Position + HC + stage cols + NMF + Total Processed
  const STAGE_COL_W = '44px'
  const HC_COL_W = '60px'
  const SUMMARY_COL_W = '58px'

  const thBase = `padding:4px 6px;border:1px solid #e5e7eb;border-bottom:2px solid ${LIME};font-size:10px;text-align:center;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;background:#f9fafb;`
  const thLeft = thBase.replace('text-align:center', 'text-align:left')

  const totals: Record<string, number> = {}
  let totalActive = 0, totalNmf = 0, totalProcessed = 0, totalHired = 0, totalHeadcount = 0

  const bodyRows: string[] = []

  for (const client of data.clients) {
    bodyRows.push(`<tr>
      <td colspan="${colCount}" style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;border-left:3px solid ${LIME};font-size:12px;font-weight:700;color:#374151;">${esc(client.client)}</td>
    </tr>`)

    for (const pos of client.positions) {
      const stageMap: Record<string, number> = {}
      for (const s of pos.pipelineStages) stageMap[s.stage] = s.count
      const activeCount = pos.pipelineStages.reduce((sum, s) => sum + s.count, 0)
      totalActive += activeCount
      totalNmf += pos.notMovingForward
      totalProcessed += pos.totalProcessed
      for (const s of SUMMARY_STAGES) {
        totals[s.key] = (totals[s.key] ?? 0) + (stageMap[s.key] ?? 0)
      }
      const posHired = stageMap['HIRED'] ?? 0
      const posHc = pos.headcount
      totalHired += posHired
      totalHeadcount += posHc

      const hcCell = (() => {
        const frac = `${posHired}/${posHc}`
        if (posHired === 0) return `<td style="padding:4px 6px;border:1px solid #e5e7eb;font-size:12px;text-align:center;color:#9ca3af;">○ ${frac}</td>`
        if (posHired >= posHc) return `<td style="padding:4px 6px;border:1px solid #e5e7eb;font-size:12px;text-align:center;color:#2F2C29;font-weight:500;">✓ ${frac}</td>`
        return `<td style="padding:4px 6px;border:1px solid #e5e7eb;font-size:12px;text-align:center;color:#f59e0b;">◐ ${frac}</td>`
      })()

      const stageCells = SUMMARY_STAGES.map((s) => {
        const n = stageMap[s.key] ?? 0
        return `<td style="padding:4px 6px;border:1px solid #e5e7eb;font-size:13px;text-align:center;color:${n > 0 ? '#111827' : '#d1d5db'};font-weight:${n > 0 ? '600' : '400'};">${n > 0 ? n : '—'}</td>`
      }).join('')

      const posLink = emailMode
        ? `<span style="font-size:13px;font-weight:500;color:#111827;">${esc(pos.title)}</span>`
        : `<a href="/positions/${pos.id}" style="font-size:13px;font-weight:500;color:#111827;text-decoration:none;" target="_blank">${esc(pos.title)}</a>`

      bodyRows.push(`<tr>
        <td style="padding:4px 6px 4px 12px;border:1px solid #e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${posLink}</td>
        ${hcCell}
        ${stageCells}
        <td style="padding:4px 6px;border:1px solid #e5e7eb;font-size:13px;text-align:center;font-weight:400;color:#9ca3af;">${pos.notMovingForward || '—'}</td>
        <td style="padding:4px 6px;border:1px solid #e5e7eb;font-size:13px;text-align:center;font-weight:500;color:#6b7280;">${pos.totalProcessed || '—'}</td>
      </tr>`)
    }
  }

  const totalCells = SUMMARY_STAGES.map((s) => {
    const n = totals[s.key] ?? 0
    return `<td style="padding:4px 6px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:13px;text-align:center;font-weight:700;color:#111827;background:#f9fafb;">${n > 0 ? n : '—'}</td>`
  }).join('')

  const colgroup = `<colgroup>
    <col>
    <col style="width:${HC_COL_W};">
    ${SUMMARY_STAGES.map(() => `<col style="width:${STAGE_COL_W};">`).join('')}
    <col style="width:${SUMMARY_COL_W};">
    <col style="width:${SUMMARY_COL_W};">
  </colgroup>`

  return `
    <div style="margin-bottom:32px;overflow-x:auto;">
      <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">All Open Positions</h2>
      <table style="border-collapse:collapse;width:100%;table-layout:fixed;min-width:0;">
        ${colgroup}
        <thead>
          <tr>
            <th style="${thLeft}">Position</th>
            <th style="${thBase}">HC</th>
            ${SUMMARY_STAGES.map((s) => `<th style="${thBase}">${esc(s.label)}</th>`).join('')}
            <th style="${thBase}">Not Fwd</th>
            <th style="${thBase}">Total</th>
          </tr>
        </thead>
        <tbody>${bodyRows.join('')}</tbody>
        <tfoot>
          <tr>
            <td style="padding:4px 6px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:13px;font-weight:700;color:#111827;background:#f9fafb;">Totals</td>
            ${(() => {
              const frac = `${totalHired}/${totalHeadcount}`
              if (totalHired === 0) return `<td style="padding:4px 6px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:12px;text-align:center;color:#9ca3af;background:#f9fafb;">○ ${frac}</td>`
              if (totalHired >= totalHeadcount) return `<td style="padding:4px 6px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:12px;text-align:center;color:#2F2C29;font-weight:500;background:#f9fafb;">✓ ${frac}</td>`
              return `<td style="padding:4px 6px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:12px;text-align:center;color:#f59e0b;background:#f9fafb;">◐ ${frac}</td>`
            })()}
            ${totalCells}
            <td style="padding:4px 6px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:13px;text-align:center;font-weight:400;color:#9ca3af;background:#f9fafb;">${totalNmf}</td>
            <td style="padding:4px 6px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:13px;text-align:center;font-weight:500;color:#6b7280;background:#f9fafb;">${totalProcessed}</td>
          </tr>
        </tfoot>
      </table>
    </div>`
}

export function renderPipelineHtml(
  data: PipelineReportData,
  opts: { printMode?: boolean; emailMode?: boolean } = {},
): string {
  const { printMode, emailMode } = opts

  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

  const headerSection = buildHeaderSection(data, emailMode ?? false)
  const overviewTable = buildOverviewTable(data, emailMode ?? false)

  const clientBlocks = data.clients.map((c) => {
    const posBlocks = c.positions.map((pos) => {
      const stageRows = pos.pipelineStages.map((s) => {
        const displayLabel = stageLabel(s.label)
        const names = s.candidates.map((cand) => `${esc(cand.name)} (${cand.days}d)`).join(', ')
        return `
          <tr>
            <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;color:#374151;white-space:nowrap;">${esc(displayLabel)}</td>
            <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:center;font-weight:600;color:#111827;">${s.count}</td>
            <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${names}</td>
          </tr>`
      }).join('')

      const pipelineSection = pos.pipelineStages.length === 0
        ? `<p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">No active candidates.</p>`
        : `<table style="border-collapse:collapse;width:100%;margin-top:6px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:5px 8px;border:1px solid #e5e7eb;border-bottom:2px solid ${LIME};font-size:11px;text-align:left;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Stage</th>
                <th style="padding:5px 8px;border:1px solid #e5e7eb;border-bottom:2px solid ${LIME};font-size:11px;text-align:center;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">#</th>
                <th style="padding:5px 8px;border:1px solid #e5e7eb;border-bottom:2px solid ${LIME};font-size:11px;text-align:left;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Candidates</th>
              </tr>
            </thead>
            <tbody>${stageRows}</tbody>
          </table>`

      const { newCandidates, stageChanges, decisions } = pos.activity
      const hasActivity = newCandidates.length + stageChanges.length + decisions.length > 0

      const activityLines: string[] = []
      for (const n of newCandidates) {
        activityLines.push(`<li style="margin:2px 0;color:#374151;font-size:13px;">New: <strong>${esc(n.name)}</strong> <span style="color:#9ca3af;">(${esc(n.source)})</span></li>`)
      }
      for (const s of stageChanges) {
        const fromLabel = s.from === 'Applied' ? 'Pipeline' : s.from
        const toLabel = s.to === 'Applied' ? 'Pipeline' : s.to
        activityLines.push(`<li style="margin:2px 0;color:#374151;font-size:13px;">${esc(s.name)}: ${esc(fromLabel)} → ${esc(toLabel)}</li>`)
      }
      for (const d of decisions) {
        const icon = d.decision === 'Advance' ? '✓' : d.decision === 'Reject' ? '✗' : '⏸'
        const color = d.decision === 'Advance' ? '#16a34a' : d.decision === 'Reject' ? '#dc2626' : '#d97706'
        const dStage = d.stage === 'Applied' ? 'Pipeline' : d.stage
        const notes = d.notes ? ` <span style="color:#9ca3af;">— ${esc(d.notes)}</span>` : ''
        activityLines.push(`<li style="margin:2px 0;font-size:13px;"><span style="color:${color};">${icon}</span> ${esc(d.name)} — ${esc(d.decision)} (${esc(dStage)})${notes}</li>`)
      }

      const activitySection = hasActivity
        ? `<ul style="margin:6px 0 0;padding-left:18px;">${activityLines.join('')}</ul>`
        : `<p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">No activity in this period.</p>`

      return `
        <div style="margin-bottom:18px;padding-left:10px;border-left:3px solid ${LIME};">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827;">
            ${esc(pos.title)}
            <span style="font-weight:400;color:#6b7280;"> — Lead: ${esc(pos.recruiter)} — HC: ${pos.headcount}</span>
          </p>
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">Pipeline</p>
          ${pipelineSection}
          <p style="margin:12px 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">Recent Activity</p>
          ${activitySection}
        </div>`
    }).join('')

    const pageBreak = printMode ? 'page-break-after:always;' : ''

    return `
      <div style="${pageBreak}margin-bottom:32px;">
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid ${LIME};padding-bottom:6px;">${esc(c.client)}</h2>
        ${posBlocks}
      </div>`
  }).join('')


  const printStyles = printMode ? `
    <style>
      @media print {
        body { margin: 0; }
        .no-print { display: none !important; }
      }
      @page { margin: 20mm 15mm; }
    </style>` : ''

  const container = emailMode
    ? `style="max-width:600px;margin:0 auto;padding:24px;${font};"`
    : `style="max-width:820px;margin:0 auto;padding:32px 24px;${font};"`

  return `
    ${printStyles}
    <div ${container}>
      ${headerSection}
      ${overviewTable}
      ${clientBlocks || '<p style="color:#9ca3af;font-size:14px;">No open positions.</p>'}
      ${emailMode ? '<p style="margin-top:24px;font-size:12px;color:#9ca3af;">Sent by TalentOS · Tenarai LATAM</p>' : ''}
    </div>`
}
