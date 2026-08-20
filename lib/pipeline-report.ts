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

const SUMMARY_STAGES: { key: string; label: string }[] = [
  { key: 'OFFER', label: 'Offer' },
  { key: 'CLIENT_INTERVIEW', label: 'Client Int.' },
  { key: 'MANAGER_INTERVIEW', label: 'Mgr Int.' },
  { key: 'TECHNICAL_INTERVIEW', label: 'Tech' },
  { key: 'SCREENING', label: 'Screen' },
  { key: 'APPLIED', label: 'Applied' },
]

function buildOverviewTable(data: PipelineReportData, emailMode: boolean): string {
  const allPositions = data.clients.flatMap((c) =>
    c.positions.map((p) => ({ ...p, client: c.client }))
  )
  if (allPositions.length === 0) return ''

  const th = (label: string, align = 'left') =>
    `<th style="padding:5px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:${align};color:#6b7280;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;background:#f9fafb;">${esc(label)}</th>`

  const totals: Record<string, number> = {}
  let grandTotal = 0

  const rows = allPositions.map((pos) => {
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

    return `<tr>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;">${posLink}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;white-space:nowrap;">${esc(pos.client)}</td>
      ${stageCells}
      <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:center;font-weight:600;color:#111827;">${rowTotal || '—'}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;white-space:nowrap;">${esc(pos.recruiter)}</td>
    </tr>`
  }).join('')

  const totalCells = SUMMARY_STAGES.map((s) => {
    const n = totals[s.key] ?? 0
    return `<td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:center;font-weight:700;color:#111827;background:#f9fafb;">${n > 0 ? n : '—'}</td>`
  }).join('')

  return `
    <div style="margin-bottom:32px;overflow-x:auto;">
      <h2 style="margin:0 0 10px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">All Open Positions</h2>
      <table style="border-collapse:collapse;width:100%;min-width:600px;">
        <thead>
          <tr>
            ${th('Position')}${th('Client')}
            ${SUMMARY_STAGES.map((s) => th(s.label, 'center')).join('')}
            ${th('Total', 'center')}${th('Lead Recruiter')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;font-weight:700;color:#111827;background:#f9fafb;">Totals</td>
            ${totalCells}
            <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:center;font-weight:700;color:#111827;background:#f9fafb;">${grandTotal}</td>
            <td style="padding:5px 8px;border:1px solid #e5e7eb;background:#f9fafb;"></td>
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
      // Pipeline table
      const stageRows = pos.pipelineStages.map((s) => {
        const names = s.candidates.map((c) => `${esc(c.name)} (${c.days}d)`).join(', ')
        return `
          <tr>
            <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;color:#374151;white-space:nowrap;">${esc(s.label)}</td>
            <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:center;font-weight:600;color:#111827;">${s.count}</td>
            <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${names}</td>
          </tr>`
      }).join('')

      const pipelineSection = pos.pipelineStages.length === 0
        ? `<p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">No active candidates.</p>`
        : `<table style="border-collapse:collapse;width:100%;margin-top:6px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:5px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:left;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Stage</th>
                <th style="padding:5px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">#</th>
                <th style="padding:5px 8px;border:1px solid #e5e7eb;font-size:11px;text-align:left;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Candidates</th>
              </tr>
            </thead>
            <tbody>${stageRows}</tbody>
          </table>`

      // Activity
      const { newCandidates, stageChanges, decisions } = pos.activity
      const hasActivity = newCandidates.length + stageChanges.length + decisions.length > 0

      const activityLines: string[] = []
      for (const n of newCandidates) {
        activityLines.push(`<li style="margin:2px 0;color:#374151;font-size:13px;">New: <strong>${esc(n.name)}</strong> <span style="color:#9ca3af;">(${esc(n.source)})</span></li>`)
      }
      for (const s of stageChanges) {
        activityLines.push(`<li style="margin:2px 0;color:#374151;font-size:13px;">${esc(s.name)}: ${esc(s.from)} → ${esc(s.to)}</li>`)
      }
      for (const d of decisions) {
        const icon = d.decision === 'Advance' ? '✓' : d.decision === 'Reject' ? '✗' : '⏸'
        const color = d.decision === 'Advance' ? '#16a34a' : d.decision === 'Reject' ? '#dc2626' : '#d97706'
        const notes = d.notes ? ` <span style="color:#9ca3af;">— ${esc(d.notes)}</span>` : ''
        activityLines.push(`<li style="margin:2px 0;font-size:13px;"><span style="color:${color};">${icon}</span> ${esc(d.name)} — ${esc(d.decision)} (${esc(d.stage)})${notes}</li>`)
      }

      const activitySection = hasActivity
        ? `<ul style="margin:6px 0 0;padding-left:18px;">${activityLines.join('')}</ul>`
        : `<p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">No activity in this period.</p>`

      return `
        <div style="margin-bottom:18px;padding-left:8px;border-left:3px solid #e5e7eb;">
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
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid #111827;padding-bottom:6px;">${esc(c.client)}</h2>
        ${posBlocks}
      </div>`
  }).join('')

  const summary = data.summary
  const summaryBlock = `
    <div style="margin-top:32px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
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
    : `style="max-width:800px;margin:0 auto;padding:32px 24px;${font};"`

  return `
    ${printStyles}
    <div ${container}>
      <div style="margin-bottom:28px;">
        <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Pipeline Report — Tenarai LATAM</h1>
        <p style="margin:0;font-size:13px;color:#6b7280;">Generated: ${generated} · Activity: ${from} – ${to}</p>
      </div>
      ${overviewTable}
      ${clientBlocks || '<p style="color:#9ca3af;font-size:14px;">No open positions.</p>'}
      ${summaryBlock}
      ${emailMode ? '<p style="margin-top:24px;font-size:12px;color:#9ca3af;">Sent by TalentOS · Tenarai LATAM</p>' : ''}
    </div>`
}
