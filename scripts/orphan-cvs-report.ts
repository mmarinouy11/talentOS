// Orphan CV files in the Drive folder (GOOGLE_DRIVE_FOLDER_ID).
//
//   npx tsx scripts/orphan-cvs-report.ts                      dry run: list orphan CVs, delete nothing
//   npx tsx scripts/orphan-cvs-report.ts --apply              delete the listed orphan CVs
//   npx tsx scripts/orphan-cvs-report.ts --min-age-hours=48   only consider files older than N hours (default 24)
//
// A file counts as referenced if its id appears in Candidate.cvDriveId (including soft-deleted
// candidates), Interview.feedbackPdfUrl, or any SystemSettings value (e.g. the email header image).
// The folder is shared with feedback PDFs and the email header image, so files named feedback_* or
// email_header_* are never treated as CVs. Recent files are skipped so an in-flight submission's
// CV (uploaded before its candidate row exists) is never deleted.

import { db } from '../lib/db'
import { getDriveClient } from '../lib/google'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const minAgeArg = args.find((a) => a.startsWith('--min-age-hours='))
const MIN_AGE_HOURS = minAgeArg ? Number(minAgeArg.split('=')[1]) : 24
const NON_CV_PREFIXES = ['feedback_', 'email_header_']

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

async function main() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set')
  if (!Number.isFinite(MIN_AGE_HOURS) || MIN_AGE_HOURS < 0) throw new Error('--min-age-hours must be a non-negative number')

  console.log(`orphan-cvs-report — mode: ${APPLY ? 'APPLY (delete)' : 'DRY RUN'}, min age ${MIN_AGE_HOURS}h`)
  const [files, refs] = await Promise.all([listFolder(folderId), referencedIds()])
  const cutoff = Date.now() - MIN_AGE_HOURS * 3600_000

  const isReferenced = (f: DriveFile) => refs.ids.has(f.id) || refs.settingValues.some((v) => v.includes(f.id))
  const nonCv = files.filter((f) => NON_CV_PREFIXES.some((p) => f.name.startsWith(p)))
  const cvFiles = files.filter((f) => !nonCv.includes(f))
  const unreferenced = cvFiles.filter((f) => !isReferenced(f))
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
    if (orphans.length) console.log('\nDry run — nothing deleted. Re-run with --apply to delete these files.')
    return
  }

  const drive = getDriveClient()
  let deleted = 0, failed = 0
  for (const f of orphans) {
    try {
      await drive.files.delete({ fileId: f.id, supportsAllDrives: true })
      deleted++
    } catch (err) {
      failed++
      console.error(`  ✗ failed to delete ${f.id} (${f.name}):`, err instanceof Error ? err.message : err)
    }
  }
  console.log(`\nDeleted ${deleted} orphan CV file(s)${failed ? `, ${failed} failed` : ''}.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
