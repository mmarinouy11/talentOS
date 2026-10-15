// Orphan CV files in the Drive folder (GOOGLE_DRIVE_FOLDER_ID).
//
//   npx tsx scripts/orphan-cvs-report.ts                      dry run: list orphan CVs
//   npx tsx scripts/orphan-cvs-report.ts --apply              move the listed orphan CVs to the Drive trash
//   npx tsx scripts/orphan-cvs-report.ts --min-age-hours=48   only consider files older than N hours (default 24)
//
//   npx tsx scripts/orphan-cvs-report.ts --match              no writes: propose orphan files for candidates without a CV
//   npx tsx scripts/orphan-cvs-report.ts --match --apply      attach unambiguous matches as the candidate's CV
//   npx tsx scripts/orphan-cvs-report.ts --match --min-confidence=high|medium|low   (default medium)
//
// A file counts as referenced if its id appears in Candidate.cvDriveId (including soft-deleted
// candidates), Interview.feedbackPdfUrl, or any SystemSettings value (e.g. the email header image).
// The folder is shared with feedback PDFs and the email header image, so files named feedback_* or
// email_header_* are never treated as CVs. Recent files are skipped when trashing so an in-flight
// submission's CV (uploaded before its candidate row exists) is never removed.
// Files are moved to the trash (restorable for 30 days), never deleted permanently.
// Run --match (and --match --apply) before --apply, so files that belong to a candidate get attached first.

import { db } from '../lib/db'
import { getDriveClient, trashDriveFile } from '../lib/google'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const MATCH = args.includes('--match')
const minAgeArg = args.find((a) => a.startsWith('--min-age-hours='))
const MIN_AGE_HOURS = minAgeArg ? Number(minAgeArg.split('=')[1]) : 24
const CONFIDENCE_ORDER = ['low', 'medium', 'high'] as const
type Confidence = (typeof CONFIDENCE_ORDER)[number]
const minConfArg = args.find((a) => a.startsWith('--min-confidence='))?.split('=')[1] as Confidence | undefined
const MIN_CONFIDENCE: Confidence = minConfArg ?? 'medium'
const NON_CV_PREFIXES = ['feedback_', 'email_header_']
const MATCH_WINDOW_MS = 24 * 3600_000

type DriveFile = { id: string; name: string; createdTime: string; size: string | null }

async function listFolder(folderId: string): Promise<DriveFile[]> {
  const drive = getDriveClient()
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'nextPageToken, files(id, name, createdTime, size)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) {
      files.push({ id: f.id!, name: f.name ?? '(no name)', createdTime: f.createdTime ?? '', size: f.size ?? null })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return files
}

async function referencedIds(): Promise<{ ids: Set<string>; settingValues: string[] }> {
  const [cands, interviews, settings] = await Promise.all([
    db.candidate.findMany({ where: { cvDriveId: { not: null } }, select: { cvDriveId: true } }),
    db.interview.findMany({ where: { feedbackPdfUrl: { not: null } }, select: { feedbackPdfUrl: true } }),
    db.systemSettings.findMany({ select: { value: true } }),
  ])
  const ids = new Set<string>()
  cands.forEach((c) => ids.add(c.cvDriveId!))
  interviews.forEach((i) => ids.add(i.feedbackPdfUrl!))
  return { ids, settingValues: settings.map((s) => s.value ?? '') }
}

function fmtSize(size: string | null) {
  if (!size) return '—'
  const kb = Number(size) / 1024
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
}

// ─── Name matching ──────────────────────────────────────────────────────────

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
// Words commonly added to CV file names that are not part of the person's name
const NOISE_WORDS = new Set(['cv', 'resume', 'curriculum', 'vitae', 'curriculo', 'profile', 'linkedin', 'updated', 'final', 'en', 'es', 'pt', 'eng', 'english', 'espanol', 'portugues', 'new', 'copy'])
// Name particles are ignored on both sides so "Maria de Souza" matches "maria_souza.pdf"
const PARTICLES = new Set(['de', 'da', 'do', 'dos', 'das', 'del', 'la', 'van', 'von', 'e', 'y'])

// File name → tokens: drop the "<timestamp>_" upload prefix and extension, lowercase, no accents,
// split on any separator, drop digits and noise words
function fileNameTokens(name: string): string[] {
  const base = name.replace(/^\d{10,}_/, '').replace(/\.[a-z0-9]{2,5}$/i, '')
  return stripAccents(base).toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1 && !NOISE_WORDS.has(t) && !PARTICLES.has(t))
}

function nameTokens(first: string, last: string): string[] {
  return stripAccents(`${first} ${last}`).toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1 && !PARTICLES.has(t))
}

function matchConfidence(fileTokens: string[], candTokens: string[]): Confidence | null {
  if (candTokens.length === 0 || fileTokens.length === 0) return null
  const fileCompact = fileTokens.join('')
  const candCompact = candTokens.join('')
  const reversed = [...candTokens.slice(1), candTokens[0]].join('')
  if (fileCompact === candCompact || fileCompact === reversed) return 'high'
  // separator-insensitive: every name part appears in the file name
  if (candTokens.every((t) => fileCompact.includes(t))) return 'medium'
  if (candTokens.length >= 2 && fileCompact.includes(candTokens[0]) && fileCompact.includes(candTokens[candTokens.length - 1])) return 'low'
  return null
}

async function runMatch(unreferenced: DriveFile[]) {
  const candidates = await db.candidate.findMany({
    where: { cvDriveId: null, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, createdAt: true },
  })
  const files = unreferenced.map((f) => ({ ...f, tokens: fileNameTokens(f.name), created: new Date(f.createdTime).getTime() }))

  type M = { candId: string; candName: string; candCreated: Date; file: (typeof files)[number]; confidence: Confidence }
  const matches: M[] = []
  for (const c of candidates) {
    const ct = nameTokens(c.firstName, c.lastName)
    for (const f of files) {
      if (!Number.isFinite(f.created) || Math.abs(f.created - c.createdAt.getTime()) > MATCH_WINDOW_MS) continue
      const conf = matchConfidence(f.tokens, ct)
      if (conf) matches.push({ candId: c.id, candName: `${c.firstName} ${c.lastName}`.trim(), candCreated: c.createdAt, file: f, confidence: conf })
    }
  }

  const byCand = new Map<string, M[]>()
  const byFile = new Map<string, M[]>()
  for (const m of matches) {
    byCand.set(m.candId, [...(byCand.get(m.candId) ?? []), m])
    byFile.set(m.file.id, [...(byFile.get(m.file.id) ?? []), m])
  }
  const rank = (c: Confidence) => CONFIDENCE_ORDER.indexOf(c)

  console.log(`\n== Match: ${candidates.length} candidates without a CV, ${files.length} unreferenced CV files ==`)
  console.log(`   ${matches.length} proposed match(es); attach requires confidence ≥ ${MIN_CONFIDENCE} and no ambiguity\n`)

  const toAttach: M[] = []
  for (const [, ms] of [...byCand.entries()].sort((a, b) => a[1][0].candName.localeCompare(b[1][0].candName))) {
    const best = [...ms].sort((a, b) => rank(b.confidence) - rank(a.confidence))
    const top = best[0]
    const ambiguousCand = best.filter((m) => m.confidence === top.confidence).length > 1
    const ambiguousFile = (byFile.get(top.file.id) ?? []).length > 1
    const eligible = !ambiguousCand && !ambiguousFile && rank(top.confidence) >= rank(MIN_CONFIDENCE)
    for (const m of best) {
      const flag = m === top && eligible ? 'ATTACH' : m === top && (ambiguousCand || ambiguousFile) ? 'AMBIGUOUS' : m === top ? 'BELOW MIN' : ''
      console.log(`  ${m.confidence.toUpperCase().padEnd(6)} ${flag.padEnd(9)} ${m.candName} (${m.candId}, created ${m.candCreated.toISOString().slice(0, 10)})  ←  ${m.file.name}  [${m.file.id}, ${m.file.createdTime.slice(0, 10)}]`)
    }
    if (eligible) toAttach.push(top)
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing attached. ${toAttach.length} match(es) would be attached with --match --apply.`)
    return
  }
  let attached = 0
  for (const m of toAttach) {
    // only if the candidate still has no CV (guards against concurrent changes)
    const res = await db.candidate.updateMany({
      where: { id: m.candId, cvDriveId: null },
      data: { cvDriveId: m.file.id, cvOriginalName: m.file.name.replace(/^\d{10,}_/, '') },
    })
    if (res.count) { attached++; console.log(`  attached ${m.file.name} → ${m.candName} (${m.candId})`) }
  }
  console.log(`\nAttached ${attached} CV file(s).`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set')
  if (!Number.isFinite(MIN_AGE_HOURS) || MIN_AGE_HOURS < 0) throw new Error('--min-age-hours must be a non-negative number')
  if (!CONFIDENCE_ORDER.includes(MIN_CONFIDENCE)) throw new Error('--min-confidence must be high, medium or low')

  const mode = MATCH ? (APPLY ? 'MATCH + ATTACH' : 'MATCH (dry run)') : APPLY ? 'APPLY (move to trash)' : 'DRY RUN'
  console.log(`orphan-cvs-report — mode: ${mode}${MATCH ? '' : `, min age ${MIN_AGE_HOURS}h`}`)
  const [files, refs] = await Promise.all([listFolder(folderId), referencedIds()])

  const isReferenced = (f: DriveFile) => refs.ids.has(f.id) || refs.settingValues.some((v) => v.includes(f.id))
  const nonCv = files.filter((f) => NON_CV_PREFIXES.some((p) => f.name.startsWith(p)))
  const cvFiles = files.filter((f) => !nonCv.includes(f))
  const unreferenced = cvFiles.filter((f) => !isReferenced(f))

  if (MATCH) {
    await runMatch(unreferenced)
    return
  }

  const cutoff = Date.now() - MIN_AGE_HOURS * 3600_000
  const tooRecent = unreferenced.filter((f) => !f.createdTime || new Date(f.createdTime).getTime() > cutoff)
  const orphans = unreferenced
    .filter((f) => !tooRecent.includes(f))
    .sort((a, b) => a.createdTime.localeCompare(b.createdTime))

  console.log(`\nFiles in folder:            ${files.length}`)
  console.log(`  feedback/header (skipped): ${nonCv.length}`)
  console.log(`  CV files:                  ${cvFiles.length}`)
  console.log(`  referenced:                ${cvFiles.length - unreferenced.length}`)
  console.log(`  unreferenced, too recent:  ${tooRecent.length}`)
  console.log(`  orphan CVs:                ${orphans.length}\n`)

  for (const f of orphans) {
    console.log(`  ${f.createdTime.slice(0, 10)}  ${fmtSize(f.size).padStart(8)}  ${f.id}  ${f.name}`)
  }

  if (!APPLY) {
    if (orphans.length) console.log('\nDry run — nothing moved. Run --match first to attach CVs to candidates, then --apply to move the rest to the trash.')
    return
  }

  let trashed = 0, failed = 0
  for (const f of orphans) {
    try {
      await trashDriveFile(f.id)
      trashed++
    } catch (err) {
      failed++
      console.error(`  ✗ failed to move ${f.id} (${f.name}) to trash:`, err instanceof Error ? err.message : err)
    }
  }
  console.log(`\nMoved ${trashed} orphan CV file(s) to the Drive trash (restorable for 30 days)${failed ? `, ${failed} failed` : ''}.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
