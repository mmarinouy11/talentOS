import { Prisma, type RedeploymentProfile } from '@prisma/client'
import { formatInTimeZone } from 'date-fns-tz'
import { db } from './db'
import { getSheetsClient, listDriveFolderFiles, downloadFileFromDrive, uploadFileToDrive, type DriveFolderFile } from './google'
import { getRedeploymentSettings, type RedeploymentSettings } from './redeployment-settings'
import { findCandidateMatches, type DuplicateResult } from './candidate-identity'
import { hasCandidateIdentifier, realEmailOrNull } from './candidate-identifier'
import { createCandidateRecord } from './candidate-create'
import { parseCvFromBuffer, type ParsedCv } from './cv-parser'

const TZ = 'America/Montevideo'
const DAY_MS = 86_400_000

// The ONLY roster columns ever requested. The sheet also holds national IDs, salary, bill rate,
// termination reasons etc.: those columns are never read, logged or stored.
const COLUMNS = {
  rosterId: 'RosterID',
  firstName: 'First Name',
  lastName: 'Last Name',
  preferredName: 'Preferred name',
  workEmail: 'Work Email ID',
  personalEmail: 'Personal email',
  phone: 'Phone number',
  subLocation: 'Sub-Location',
  jobTitle: 'Job Title',
  client: 'Client',
  grade: 'Grade',
  yearsExp: 'Y of exp',
  primarySkill: 'Primary Skill',
  yearsInPrimary: 'Year in Primary skill',
  subSkill: 'Sub Skill',
  state: 'State',
  lwd: 'LWD',
  rehire: 'Open/Recommended for Rehire',
  cv: 'CV',
} as const
type ColumnKey = keyof typeof COLUMNS
type RosterRow = Record<ColumnKey, string | null>

export interface RedeploymentSyncSummary {
  created: number
  linked: number
  pendingDecision: number
  updated: number
  outOfWindow: number
  removed: number
  cvMissing: number
  errors: { rosterId: string | null; error: string }[]
  finishedAt: string
}

export const LAST_SYNC_SETTING_KEY = 'REDEPLOYMENT_LAST_SYNC'

function colLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}

function quoteTab(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

// Accepts a tab name or a numeric gid
async function resolveTabName(sheets: ReturnType<typeof getSheetsClient>, s: RedeploymentSettings): Promise<string> {
  if (!/^\d+$/.test(s.sheetTab)) return s.sheetTab
  const meta = await sheets.spreadsheets.get({ spreadsheetId: s.sheetId, fields: 'sheets.properties' })
  const tab = meta.data.sheets?.find((sh) => String(sh.properties?.sheetId) === s.sheetTab)
  if (!tab?.properties?.title) throw new Error(`No tab with gid ${s.sheetTab} in the roster sheet`)
  return tab.properties.title
}

// Reads the header row, then ONLY the mapped columns, zipped by row index
async function readRoster(s: RedeploymentSettings): Promise<RosterRow[]> {
  const sheets = getSheetsClient()
  const tab = quoteTab(await resolveTabName(sheets, s))
  const header = await sheets.spreadsheets.values.get({ spreadsheetId: s.sheetId, range: `${tab}!1:1` })
  const headers = (header.data.values?.[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase())

  const letters = {} as Record<ColumnKey, string>
  const missing: string[] = []
  for (const [key, name] of Object.entries(COLUMNS) as [ColumnKey, string][]) {
    const idx = headers.indexOf(name.toLowerCase())
    if (idx === -1) missing.push(name); else letters[key] = colLetter(idx)
  }
  if (missing.length > 0) throw new Error(`Roster sheet is missing required headers: ${missing.join(', ')}`)

  const keys = Object.keys(COLUMNS) as ColumnKey[]
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: s.sheetId,
    ranges: keys.map((k) => `${tab}!${letters[k]}2:${letters[k]}`),
    majorDimension: 'COLUMNS',
  })
  const columns = keys.map((_, i) => (res.data.valueRanges?.[i]?.values?.[0] ?? []) as unknown[])
  const rowCount = Math.max(0, ...columns.map((c) => c.length))
  const rows: RosterRow[] = []
  for (let r = 0; r < rowCount; r++) {
    const row = {} as RosterRow
    keys.forEach((k, i) => {
      const v = columns[i][r]
      const t = v == null ? '' : String(v).trim()
      row[k] = t === '' ? null : t
    })
    rows.push(row)
  }
  return rows
}

// dd/mm/yyyy (or dd-mm-yyyy, dd.mm.yyyy), yyyy-mm-dd, sheet serial numbers, then a last-resort Date.parse
export function parseLwd(raw: string | null): Date | null {
  if (!raw) return null
  const v = raw.trim()
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Number(v)
    if (serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * DAY_MS)
    return null
  }
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return utc(+m[1], +m[2], +m[3])
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) return utc(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  const t = Date.parse(v)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return utc(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function utc(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCMonth() === mo - 1 ? date : null
}

function num(v: string | null): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function todayUtc(now: Date): Date {
  return new Date(`${formatInTimeZone(now, TZ, 'yyyy-MM-dd')}T00:00:00Z`)
}

function isEligible(row: RosterRow, lwd: Date | null, s: RedeploymentSettings, today: Date): boolean {
  if (!row.rehire || !s.rehireValues.includes(row.rehire.trim().toLowerCase())) return false
  if (!lwd) return false
  return lwd.getTime() >= today.getTime() - s.pastDays * DAY_MS && lwd.getTime() <= today.getTime() + s.futureDays * DAY_MS
}

function rosterFields(row: RosterRow, lwd: Date | null): Omit<Prisma.RedeploymentProfileUncheckedCreateInput, 'rosterId' | 'lastSyncedAt'> {
  return {
    lwd,
    lastJobTitle: row.jobTitle,
    lastClient: row.client,
    grade: row.grade,
    primarySkill: row.primarySkill,
    subSkill: row.subSkill,
    yearsExperience: num(row.yearsExp),
    yearsInPrimarySkill: num(row.yearsInPrimary),
    subLocation: row.subLocation,
    rosterState: row.state,
    rehireFlag: row.rehire,
    personalEmail: realEmailOrNull(row.personalEmail)?.toLowerCase() ?? null,
    workEmail: realEmailOrNull(row.workEmail)?.toLowerCase() ?? null,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    preferredName: row.preferredName,
    cvFileName: row.cv,
  }
}

// The CV column may hold an AppSheet path ("Roster_Files_/Juan_Perez_CV.pdf"): match on the file name only.
// Exact name first; the case-insensitive "contains" fallback counts only when it matches exactly one file.
function findCvFile(files: DriveFolderFile[], raw: string | null, rosterId: string): DriveFolderFile | null {
  const name = raw?.split('/').pop()?.trim()
  if (!name) return null
  const exact = files.find((f) => f.name === name)
  if (exact) return exact
  const lower = name.toLowerCase()
  const partial = files.filter((f) => f.name.toLowerCase().includes(lower))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) console.warn(`[redeployment] Roster ${rosterId}: ambiguous CV match (${partial.length} files)`)
  return null
}

// Never read CVs from TalentOS's own CV folder by mistake
function assertCvFolderIsNotOurs(s: RedeploymentSettings) {
  const ours = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()
  if (s.cvFolderId && ours && s.cvFolderId === ours) {
    throw new Error('REDEPLOYMENT_CV_FOLDER_ID points to the TalentOS CV folder (GOOGLE_DRIVE_FOLDER_ID). Set it to the roster CV folder in /settings.')
  }
}

// Empty REDEPLOYMENT_CV_FOLDER_ID: CV lookup is skipped (rows count as cvMissing)
async function listRosterCvFiles(s: RedeploymentSettings): Promise<DriveFolderFile[]> {
  return s.cvFolderId ? listDriveFolderFiles(s.cvFolderId) : []
}

function cvKind(file: { name: string; mimeType: string }): 'pdf' | 'docx' | null {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf') || file.mimeType === 'application/pdf') return 'pdf'
  if (n.endsWith('.docx') || file.mimeType.includes('wordprocessingml')) return 'docx'
  return null
}

// Personal email first, then work email; also phone + name for possible duplicates
async function matchProfile(p: Pick<RedeploymentProfile, 'personalEmail' | 'workEmail' | 'phone' | 'firstName' | 'lastName' | 'preferredName'>): Promise<DuplicateResult> {
  const names = { firstName: p.firstName ?? p.preferredName ?? '', lastName: p.lastName ?? '', phone: p.phone }
  const emails = [p.personalEmail, p.workEmail].filter((e): e is string => !!e)
  let possible: DuplicateResult | null = null
  for (const email of emails.length > 0 ? emails : [null]) {
    const r = await findCandidateMatches({ ...names, email })
    if (r.kind === 'exact' || r.kind === 'conflict') return r
    if (r.kind === 'possible' && !possible) possible = r
  }
  return possible ?? { kind: 'none', candidates: [] }
}

// The sync and the "Different person" decision create the candidate the same way
export async function createCandidateFromProfile(
  profile: RedeploymentProfile,
  recruiterId: string,
  cvFile: DriveFolderFile | null,
): Promise<{ candidateId: string; cvMissing: boolean }> {
  const email = profile.personalEmail ?? profile.workEmail
  if (!hasCandidateIdentifier(email, null)) throw new Error('No email in the roster')

  let parsed: Partial<ParsedCv> = {}
  let cvDriveId: string | null = null
  let cvOriginalName: string | null = null
  if (cvFile) {
    const buffer = await downloadFileFromDrive(cvFile.id)
    const kind = cvKind(cvFile)
    const uploaded = await uploadFileToDrive(buffer, `${Date.now()}_${cvFile.name}`, cvFile.mimeType || 'application/octet-stream', process.env.GOOGLE_DRIVE_FOLDER_ID!)
    cvDriveId = uploaded.fileId
    cvOriginalName = cvFile.name
    if (kind) {
      try { parsed = await parseCvFromBuffer(buffer, kind) } catch (err) {
        console.error(`[redeployment] CV parse failed for roster ${profile.rosterId}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  const rosterSkills = [profile.primarySkill, profile.subSkill].filter((s): s is string => !!s)
  const cvSkills = Array.isArray(parsed.skills) ? parsed.skills.filter((s) => typeof s === 'string') : []
  const skills = [...new Map([...rosterSkills, ...cvSkills].map((s) => [s.toLowerCase(), s])).values()]
  const work = profile.workEmail && profile.workEmail !== email ? profile.workEmail : null
  const seniorities = ['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']

  // Roster fields win; the CV only fills what the roster leaves empty
  const c = await createCandidateRecord({
    firstName: profile.preferredName || profile.firstName || parsed.firstName || '',
    lastName: profile.lastName || parsed.lastName || '',
    email,
    phone: profile.phone || parsed.phone || null,
    country: parsed.country || null,
    linkedinUrl: parsed.linkedinUrl || null,
    seniority: parsed.seniority && seniorities.includes(parsed.seniority) ? parsed.seniority : undefined,
    yearsOfExperience: profile.yearsExperience != null ? Math.round(profile.yearsExperience) : (typeof parsed.yearsOfExperience === 'number' ? Math.round(parsed.yearsOfExperience) : null),
    skills,
    languages: Array.isArray(parsed.languages) ? parsed.languages : [],
    summary: parsed.summary || null,
    cvDriveId,
    cvOriginalName,
    cvExperience: Array.isArray(parsed.experience) ? parsed.experience : null,
    cvEducation: Array.isArray(parsed.education) ? parsed.education : null,
    notes: work ? `Work email: ${work}` : null,
    recruiterId,
    sourcedByType: 'REDEPLOYMENT',
  })
  return { candidateId: c.id, cvMissing: !cvFile }
}

// Candidates created by the sync are owned by the earliest ADMIN (Candidate.recruiterId is required)
async function defaultRecruiterId(): Promise<string> {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!admin) throw new Error('No ADMIN user to own redeployment candidates')
  return admin.id
}

// Links the profile to an existing candidate, parks it for a decision, or creates the candidate
async function resolveProfile(profile: RedeploymentProfile, cv: DriveFolderFile | null, recruiterId: string, summary: RedeploymentSyncSummary) {
  const match = await matchProfile(profile)
  if (match.kind === 'exact') {
    const candidateId = match.candidates[0].id
    const taken = await db.redeploymentProfile.findFirst({ where: { candidateId }, select: { rosterId: true } })
    if (taken) {
      // Same candidate already linked to another roster ID: needs a person to look at it
      await db.redeploymentProfile.update({ where: { id: profile.id }, data: { possibleDuplicateOfId: candidateId, parsedSnapshot: { matchKind: 'exact-taken' } } })
      summary.pendingDecision++
    } else {
      await db.redeploymentProfile.update({ where: { id: profile.id }, data: { candidateId } })
      summary.linked++
    }
  } else if (match.kind === 'possible' || match.kind === 'conflict') {
    await db.redeploymentProfile.update({
      where: { id: profile.id },
      data: { possibleDuplicateOfId: match.candidates[0].id, parsedSnapshot: { matchKind: match.kind } },
    })
    summary.pendingDecision++
  } else {
    const { candidateId } = await createCandidateFromProfile(profile, recruiterId, cv)
    await db.redeploymentProfile.update({ where: { id: profile.id }, data: { candidateId } })
    summary.created++
  }
}

const g = globalThis as unknown as { __redeploymentSyncRunning?: boolean }

export async function runRedeploymentSync(opts: { recruiterId?: string } = {}): Promise<RedeploymentSyncSummary> {
  if (g.__redeploymentSyncRunning) throw new Error('A redeployment sync is already running')
  g.__redeploymentSyncRunning = true
  try {
    return await sync(opts)
  } finally {
    g.__redeploymentSyncRunning = false
  }
}

async function sync(opts: { recruiterId?: string }): Promise<RedeploymentSyncSummary> {
  const s = await getRedeploymentSettings()
  assertCvFolderIsNotOurs(s)
  const now = new Date()
  const today = todayUtc(now)
  const summary: RedeploymentSyncSummary = {
    created: 0, linked: 0, pendingDecision: 0, updated: 0, outOfWindow: 0, removed: 0, cvMissing: 0, errors: [], finishedAt: '',
  }

  const rows = await readRoster(s)
  let files: DriveFolderFile[] | null = null
  const cvFiles = async () => (files ??= await listRosterCvFiles(s))
  const recruiterId = opts.recruiterId ?? await defaultRecruiterId()

  const seen = new Set<string>()
  for (const row of rows) {
    const rosterId = row.rosterId
    if (!rosterId || seen.has(rosterId)) continue
    seen.add(rosterId)
    try {
      const lwd = parseLwd(row.lwd)
      const eligible = isEligible(row, lwd, s, today)
      const existing = await db.redeploymentProfile.findUnique({ where: { rosterId } })
      if (!existing && !eligible) continue

      const fields = rosterFields(row, lwd)
      if (existing) {
        const status = eligible ? 'ACTIVE' : 'OUT_OF_WINDOW'
        // Roster CV reference for linked candidates; their own CV is never replaced
        const cv = fields.cvFileName ? findCvFile(await cvFiles(), fields.cvFileName, rosterId) : null
        const updated = await db.redeploymentProfile.update({
          where: { id: existing.id },
          data: { ...fields, status, lastSyncedAt: now, sourceCvDriveFileId: cv?.id ?? existing.sourceCvDriveFileId },
        })
        summary.updated++
        if (status === 'OUT_OF_WINDOW' && existing.status !== 'OUT_OF_WINDOW') summary.outOfWindow++
        // Unresolved earlier (e.g. no email in the roster at the time): try again while eligible
        if (eligible && !updated.candidateId && !updated.possibleDuplicateOfId) await resolveProfile(updated, cv, recruiterId, summary)
        continue
      }

      const cv = findCvFile(await cvFiles(), fields.cvFileName ?? null, rosterId)
      const profile = await db.redeploymentProfile.create({
        data: { ...fields, rosterId, status: 'ACTIVE', lastSyncedAt: now, sourceCvDriveFileId: cv?.id ?? null },
      })
      if (!cv) summary.cvMissing++

      await resolveProfile(profile, cv, recruiterId, summary)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      summary.errors.push({ rosterId, error: message })
      console.error(`[redeployment] Roster ${rosterId} failed: ${message}`)
    }
  }

  // People no longer on the roster; their candidates are never deleted
  const removed = await db.redeploymentProfile.updateMany({
    where: { rosterId: { notIn: [...seen] }, status: { not: 'REMOVED' } },
    data: { status: 'REMOVED', lastSyncedAt: now },
  })
  summary.removed = removed.count

  summary.finishedAt = new Date().toISOString()
  await db.systemSettings.upsert({
    where: { key: LAST_SYNC_SETTING_KEY },
    update: { value: JSON.stringify(summary) },
    create: { key: LAST_SYNC_SETTING_KEY, value: JSON.stringify(summary), description: 'Result of the last Redeployment roster sync (managed automatically).' },
  })
  const { errors, ...counts } = summary
  console.log('[redeployment] Sync finished', JSON.stringify({ ...counts, errors: errors.map((e) => e.rosterId) }))
  return summary
}

export async function getLastSyncSummary(): Promise<RedeploymentSyncSummary | null> {
  const row = await db.systemSettings.findUnique({ where: { key: LAST_SYNC_SETTING_KEY } })
  if (!row) return null
  try { return JSON.parse(row.value) as RedeploymentSyncSummary } catch { return null }
}

// Pending decision. "same" links the existing candidate (never modified); "different" creates one from the
// profile and the roster CV.
export async function decideRedeploymentProfile(profileId: string, decision: 'same' | 'different', recruiterId: string): Promise<void> {
  const profile = await db.redeploymentProfile.findUnique({ where: { id: profileId } })
  if (!profile || profile.candidateId || !profile.possibleDuplicateOfId) throw new Error('This profile no longer needs a decision')
  if (decision === 'same') {
    const existing = await db.candidate.findFirst({ where: { id: profile.possibleDuplicateOfId, deletedAt: null }, select: { id: true } })
    if (!existing) throw new Error('The existing candidate was deleted')
    const taken = await db.redeploymentProfile.findFirst({ where: { candidateId: existing.id }, select: { rosterId: true } })
    if (taken) throw new Error(`That candidate is already linked to roster ID ${taken.rosterId}`)
    await db.redeploymentProfile.update({ where: { id: profileId }, data: { candidateId: existing.id, possibleDuplicateOfId: null, parsedSnapshot: Prisma.DbNull } })
    return
  }
  const s = await getRedeploymentSettings()
  assertCvFolderIsNotOurs(s)
  const cv = profile.cvFileName ? findCvFile(await listRosterCvFiles(s), profile.cvFileName, profile.rosterId) : null
  const { candidateId } = await createCandidateFromProfile(profile, recruiterId, cv)
  await db.redeploymentProfile.update({ where: { id: profileId }, data: { candidateId, possibleDuplicateOfId: null, parsedSnapshot: Prisma.DbNull } })
}
