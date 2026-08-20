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
}

export interface PipelineClient {
  client: string
  positions: PipelinePosition[]
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
  clients: PipelineClient[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Fix 3: "Applied" → "Pipeline" everywhere
const STAGE_DISPLAY: Record<string, string> = {
  APPLIED: 'Pipeline',
}

function stageLabel(raw: string): string {
  return STAGE_DISPLAY[raw] ?? raw
}

const SUMMARY_STAGES: { key: string; label: string }[] = [
  { key: 'OFFER', label: 'Offer' },
  { key: 'CLIENT_INTERVIEW', label: 'Client Int.' },
  { key: 'MANAGER_INTERVIEW', label: 'Mgr Int.' },
  { key: 'TECHNICAL_INTERVIEW', label: 'Tech' },
  { key: 'SCREENING', label: 'Screen' },
  { key: 'APPLIED', label: 'Pipeline' }, // Fix 3
]

const LIME = '#8CF000'

function buildOverviewTable(data: PipelineReportData, emailMode: boolean): string {
  if (data.clients.length === 0) return ''

  // Fix 1: no Lead Recruiter column
  // Fix 2: group by client with separator rows
  // Fix 4: lime bottom border on column headers, lime left border on client rows, lime top border on totals

  const colCount = SUMMARY_STAGES.length + 2 // Position + stage cols + Total

  const thStyle = `padding:5px 8px;border:1px solid #e5e7eb;border-bottom:2px solid ${LIME};font-size:11px;text-align:center;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;background:#f9fafb;`
  const thStyleLeft = thStyle.replace('text-align:center', 'text-align:left')

  const totals: Record<string, number> = {}
  let grandTotal = 0

  const bodyRows: string[] = []

  for (const client of data.clients) {
    // Client separator row — Fix 2, Fix 4
    bodyRows.push(`<tr>
      <td colspan="${colCount}" style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;border-left:3px solid ${LIME};font-size:12px;font-weight:700;color:#374151;">${esc(client.client)}</td>
    </tr>`)

    for (const pos of client.positions) {
      const stageMap: Record<string, number> = {}
      for (const s of pos.pipelineStages) stageMap[s.stage] = s.count
      const rowTotal = pos.pipelineStages.reduce((sum, s) => sum + s.count, 0)
      grandTotal += rowTotal
      for (const s of SUMMARY_STAGES) {
        totals[s.key] = (totals[s.key] ?? 0) + (stageMap[s.key] ?? 0)
      }

      const stageCells = SUMMARY_STAGES.map((s) => {
        const n = stageMap[s.key] ?? 0
        return `<td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:center;color:${n > 0 ? '#111827' : '#d1d5db'};font-weight:${n > 0 ? '600' : '400'};">${n > 0 ? n : '—'}</td>`
      }).join('')

      const posLink = emailMode
        ? `<span style="font-size:13px;font-weight:500;color:#111827;">${esc(pos.title)}</span>`
        : `<a href="/positions/${pos.id}" style="font-size:13px;font-weight:500;color:#111827;text-decoration:none;" target="_blank">${esc(pos.title)}</a>`

      bodyRows.push(`<tr>
        <td style="padding:5px 8px 5px 14px;border:1px solid #e5e7eb;">${posLink}</td>
        ${stageCells}
        <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:center;font-weight:600;color:#111827;">${rowTotal || '—'}</td>
      </tr>`)
    }
  }

  const totalCells = SUMMARY_STAGES.map((s) => {
    const n = totals[s.key] ?? 0
    return `<td style="padding:5px 8px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:13px;text-align:center;font-weight:700;color:#111827;background:#f9fafb;">${n > 0 ? n : '—'}</td>`
  }).join('')

  return `
    <div style="margin-bottom:32px;overflow-x:auto;">
      <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">All Open Positions</h2>
      <table style="border-collapse:collapse;width:100%;min-width:520px;">
        <thead>
          <tr>
            <th style="${thStyleLeft}">Position</th>
            ${SUMMARY_STAGES.map((s) => `<th style="${thStyle}">${esc(s.label)}</th>`).join('')}
            <th style="${thStyle}">Total</th>
          </tr>
        </thead>
        <tbody>${bodyRows.join('')}</tbody>
        <tfoot>
          <tr>
            <td style="padding:5px 8px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:13px;font-weight:700;color:#111827;background:#f9fafb;">Totals</td>
            ${totalCells}
            <td style="padding:5px 8px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};font-size:13px;text-align:center;font-weight:700;color:#111827;background:#f9fafb;">${grandTotal}</td>
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
  const from = fmtDate(data.from)
  const to = fmtDate(data.to)
  const generated = fmtDate(data.generatedAt)

  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

  const overviewTable = buildOverviewTable(data, emailMode ?? false)

  const clientBlocks = data.clients.map((c) => {
    const posBlocks = c.positions.map((pos) => {
      // Pipeline detail table — Fix 3: relabel Applied → Pipeline
      const stageRows = pos.pipelineStages.map((s) => {
        const displayLabel = stageLabel(s.label) // s.label is already the human label from API
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

      // Activity — Fix 3: relabel "Applied" in stage changes/decisions
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

      // Fix 4: lime left border on position blocks
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

    // Fix 4: lime underline on client section headers
    return `
      <div style="${pageBreak}margin-bottom:32px;">
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid ${LIME};padding-bottom:6px;">${esc(c.client)}</h2>
        ${posBlocks}
      </div>`
  }).join('')

  const summary = data.summary
  const summaryBlock = `
    <div style="margin-top:32px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;border-top:2px solid ${LIME};">
      <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Summary</h2>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:3px 16px 3px 0;font-size:13px;color:#6b7280;">Open positions</td><td style="padding:3px 0;font-size:13px;font-weight:600;color:#111827;">${summary.totalPositions}</td></tr>
        <tr><td style="padding:3px 16px 3px 0;font-size:13px;color:#6b7280;">Active candidates</td><td style="padding:3px 0;font-size:13px;font-weight:600;color:#111827;">${summary.totalActive}</td></tr>
        <tr><td style="padding:3px 16px 3px 0;font-size:13px;color:#6b7280;">Total headcount</td><td style="padding:3px 0;font-size:13px;font-weight:600;color:#111827;">${summary.totalHeadcount}</td></tr>
        <tr><td style="padding:3px 16px 3px 0;font-size:13px;color:#6b7280;">Interviews today</td><td style="padding:3px 0;font-size:13px;font-weight:600;color:#111827;">${summary.interviewsToday}</td></tr>
      </table>
    </div>`

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

  // Fix 4: lime accent on page title
  return `
    ${printStyles}
    <div ${container}>
      <div style="margin-bottom:28px;border-left:4px solid ${LIME};padding-left:12px;">
        <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Pipeline Report — Tenarai LATAM</h1>
        <p style="margin:0;font-size:13px;color:#6b7280;">Generated: ${generated} · Activity: ${from} – ${to}</p>
      </div>
      ${overviewTable}
      ${clientBlocks || '<p style="color:#9ca3af;font-size:14px;">No open positions.</p>'}
      ${summaryBlock}
      ${emailMode ? '<p style="margin-top:24px;font-size:12px;color:#9ca3af;">Sent by TalentOS · Tenarai LATAM</p>' : ''}
    </div>`
}
