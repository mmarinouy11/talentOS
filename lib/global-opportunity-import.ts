import { createHash } from 'crypto'
import ExcelJS from 'exceljs'
import { db } from './db'
import { getGlobalOpportunitySettings } from './global-opportunity-settings'

const SHEET = 'Base Data'

// Only these columns are read; billing, recruiters, interviewers, aging etc. are ignored
const COLUMNS = {
  requisitionId: 'Requisition Id',
  shore: 'Offshore/Onshore',
  location: 'Location',
  workRequirement: 'Client Work Requirement',
  designation: 'Designation',
  grade: 'Grade',
  experience: 'Experience',
  groupAccountName: 'Group Account Name',
  accountName: 'Account Name',
  projectName: 'Project Name',
  opportunityName: 'Opportunity Name',
  stageName: 'Stage Name',
  confidenceLevel: 'Confidence Level',
  requirementType: 'Requirement Type',
  employmentType: 'Employment Type',
  primarySkill: 'Primary Skill',
  subSkill1: 'Sub Skill',
  subSkill2: 'Sub Skill2',
  subSkill3: 'Sub Skill3',
  mandatorySkills: 'Mandatory Skills',
  jobSummary: 'Job Summary',
  jobDescription: 'Job Description',
  positions: 'No. Of Position',
  joined: 'Total Joined',
  plannedOnboarding: 'Latest Planned OnBoarding Date',
  createdOn: 'Created On',
  tidStatus: 'TID Status',
} as const
type Col = keyof typeof COLUMNS

const LATAM = new Set([
  'uruguay', 'brazil', 'argentina', 'chile', 'colombia', 'mexico', 'peru', 'costa rica', 'ecuador', 'paraguay',
  'bolivia', 'venezuela', 'guatemala', 'panama', 'dominican republic', 'el salvador', 'honduras', 'nicaragua',
])
const US = new Set(['us', 'usa', 'u.s.', 'u.s.a.', 'united states', 'united states of america'])

export interface ImportSummary {
  id: string
  fileName: string
  totalRows: number
  kept: number
  discardedOffshore: number
  discardedLatam: number
  discardedUsWfo: number
  discardedOtherLocation: number
  discardedOther: number
  deactivated: number
  newCount: number
  otherLocations: string[]
}

// exceljs cell values: plain values, rich text, hyperlinks, formulas (use the result), dates, errors
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null
  if (v instanceof Date || typeof v !== 'object') return v
  if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('')
  if ('formula' in v || 'sharedFormula' in v) return cellValue((v as { result?: ExcelJS.CellValue }).result ?? null)
  if ('text' in v && typeof (v as { text: unknown }).text === 'string') return (v as { text: string }).text
  if ('error' in v) return null
  return null
}

function text(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

function longText(v: unknown): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

function int(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  const t = text(v)
  if (!t) return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n) : null
}

// Date cells come back as Date; text accepts yyyy-mm-dd, m/d/yyyy or anything Date can parse; numbers are Excel serials
function date(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000)
  const t = text(v)
  if (!t) return null
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]))
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

function splitSkills(...values: (string | null)[]): string[] {
  const out = new Map<string, string>()
  for (const v of values) {
    for (const s of (v ?? '').split(/[,;\n]/)) {
      const t = s.trim()
      if (t) out.set(t.toLowerCase(), t)
    }
  }
  return [...out.values()]
}

// "Hybrid" | "Remote" | null (blank / unknown) | "WFO"
function workModeOf(raw: string | null): 'Hybrid' | 'Remote' | 'WFO' | null | 'other' {
  if (!raw) return null
  const v = raw.toLowerCase()
  if (v.includes('office')) return 'WFO'
  if (v.includes('hybrid')) return 'Hybrid'
  if (v.includes('remote') || v.includes('home')) return 'Remote'
  return 'other'
}

// Identical repeated requisitions share a group
export function opportunityGroupKey(o: { designation: string; accountName: string | null; location: string; workMode: string | null; mandatorySkills: string[] }): string {
  const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const parts = [norm(o.designation), norm(o.accountName), norm(o.location), norm(o.workMode), o.mandatorySkills.map(norm).sort().join(',')]
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)
}

export async function importGlobalOpportunities(buffer: Buffer, fileName: string, importedById: string): Promise<ImportSummary> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = workbook.getWorksheet(SHEET)
  if (!sheet) throw new Error(`The file has no "${SHEET}" sheet`)

  const headerIndex = new Map<string, number>()
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const h = text(cellValue(cell.value))
    if (h) headerIndex.set(h.toLowerCase(), col)
  })
  const cols = {} as Record<Col, number>
  const missing: string[] = []
  for (const [key, name] of Object.entries(COLUMNS) as [Col, string][]) {
    const idx = headerIndex.get(name.toLowerCase())
    if (idx == null) missing.push(name); else cols[key] = idx
  }
  if (missing.length > 0) throw new Error(`"${SHEET}" is missing required columns: ${missing.join(', ')}`)

  const settings = await getGlobalOpportunitySettings()
  const extra = new Map(settings.extraLocations.map((l) => [l.toLowerCase(), l]))
  const now = new Date()
  const counts = { totalRows: 0, kept: 0, discardedOffshore: 0, discardedLatam: 0, discardedUsWfo: 0, discardedOtherLocation: 0, discardedOther: 0 }
  const otherLocations = new Set<string>()
  const kept = new Map<string, Parameters<typeof db.globalOpportunity.create>[0]['data']>()

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const get = (c: Col) => cellValue(row.getCell(cols[c]).value)
    const requisitionId = text(get('requisitionId'))
    if (!requisitionId) continue
    counts.totalRows++

    const tid = text(get('tidStatus'))
    const stage = text(get('stageName'))
    if (tid?.toUpperCase() !== 'OPEN' || stage?.toLowerCase() === 'closed lost') { counts.discardedOther++; continue }
    if (text(get('shore'))?.toLowerCase() === 'offshore') { counts.discardedOffshore++; continue }

    const location = text(get('location'))
    const loc = location?.toLowerCase() ?? ''
    if (LATAM.has(loc)) { counts.discardedLatam++; continue }
    const mode = workModeOf(text(get('workRequirement')))
    const isUs = US.has(loc)
    if (isUs && mode === 'WFO') { counts.discardedUsWfo++; continue }
    const keepLocation = isUs ? (mode === 'Hybrid' || mode === 'Remote' || mode === null) : extra.has(loc)
    if (!keepLocation) {
      if (isUs) counts.discardedOther++
      else { counts.discardedOtherLocation++; if (location) otherLocations.add(location) }
      continue
    }

    const openings = (int(get('positions')) ?? 0) - (int(get('joined')) ?? 0)
    if (openings <= 0) { counts.discardedOther++; continue }

    const designation = text(get('designation')) ?? 'Untitled role'
    const accountName = text(get('accountName'))
    const workMode = mode === 'Hybrid' || mode === 'Remote' ? mode : isUs ? null : text(get('workRequirement'))
    const mandatorySkills = splitSkills(text(get('mandatorySkills')))
    const data = {
      requisitionId,
      groupKey: opportunityGroupKey({ designation, accountName, location: isUs ? 'US' : extra.get(loc)!, workMode, mandatorySkills }),
      location: isUs ? 'US' : extra.get(loc)!,
      workMode,
      designation,
      grade: text(get('grade')),
      experience: text(get('experience')),
      groupAccountName: text(get('groupAccountName')),
      accountName,
      projectName: text(get('projectName')),
      opportunityName: text(get('opportunityName')),
      stageName: stage,
      confidenceLevel: text(get('confidenceLevel')),
      requirementType: text(get('requirementType')),
      employmentType: text(get('employmentType')),
      primarySkill: text(get('primarySkill')),
      subSkills: splitSkills(text(get('subSkill1')), text(get('subSkill2')), text(get('subSkill3'))),
      mandatorySkills,
      jobSummary: longText(get('jobSummary')),
      jobDescription: longText(get('jobDescription')),
      openings,
      plannedOnboardingDate: date(get('plannedOnboarding')),
      sourceCreatedOn: date(get('createdOn')),
      active: true,
      lastSeenAt: now,
    }
    if (kept.has(requisitionId)) counts.totalRows-- // repeated row for the same requisition: last one wins
    kept.set(requisitionId, data)
  }
  counts.kept = kept.size

  const ids = [...kept.keys()]
  const existing = new Set((await db.globalOpportunity.findMany({ where: { requisitionId: { in: ids } }, select: { requisitionId: true } })).map((e) => e.requisitionId))
  for (const data of kept.values()) {
    const { requisitionId, ...rest } = data
    await db.globalOpportunity.upsert({ where: { requisitionId }, create: data, update: rest })
  }
  // A file with nothing kept is almost certainly the wrong file: never deactivate everything because of it
  const deactivated = ids.length > 0
    ? (await db.globalOpportunity.updateMany({ where: { active: true, requisitionId: { notIn: ids } }, data: { active: false } })).count
    : 0

  const record = await db.globalOpportunityImport.create({
    data: { fileName, importedById, ...counts, deactivated, newCount: ids.filter((id) => !existing.has(id)).length },
  })
  console.log('[global-opportunities] Import', JSON.stringify({ ...counts, deactivated, newCount: record.newCount }))
  return { ...record, otherLocations: [...otherLocations].sort() }
}
