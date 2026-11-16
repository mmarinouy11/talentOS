// Candidates in an active pipeline with no stored work history (cvExperience) — diagnose and repair.
//
//   npx tsx scripts/backfill-cv-experience.ts              dry run (default): list them grouped by source and CV type
//                                                          (PDF / scanned PDF / DOCX / unsupported / unreadable / none); no AI calls
//   npx tsx scripts/backfill-cv-experience.ts --apply      parse each stored CV with parseCvFromBuffer and fill ONLY empty fields
//                                                          (cvExperience, cvEducation, summary, skills); concurrency 2
//   --limit=N                                              process only the first N (for a first test run)
//
// Failures are logged with the candidate ID and the reason and the run continues; a summary prints at the end.
// Needs DATABASE_URL, GOOGLE_SERVICE_ACCOUNT_KEY and (for --apply) ANTHROPIC_API_KEY.
import { db } from '../lib/db'
import { downloadFileFromDrive } from '../lib/google'
import { detectCvKind, isScannedPdf, fillCvExperienceFromDrive, cvParseErrorReason } from '../lib/cv-experience'

const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity

type Row = { id: string; name: string; source: string; cvDriveId: string | null; cvType?: string }

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  const queue = [...items]
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item)
  }))
}

async function main() {
  const candidates = await db.candidate.findMany({
    where: { deletedAt: null, candidatePositions: { some: { status: 'ACTIVE' } } },
    select: { id: true, firstName: true, lastName: true, sourcedByType: true, cvDriveId: true, cvExperience: true },
    orderBy: { createdAt: 'asc' },
  })
  const rows: Row[] = candidates
    .filter((c) => !Array.isArray(c.cvExperience) || c.cvExperience.length === 0)
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), source: c.sourcedByType ?? 'UNSPECIFIED', cvDriveId: c.cvDriveId }))

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} candidate(s) in an active pipeline without stored work history${Number.isFinite(limit) ? ` (limit ${limit})` : ''}\n`)

  if (!apply) {
    // CV type by content (download only, no AI)
    await pool(rows, 4, async (r) => {
      if (!r.cvDriveId) { r.cvType = 'none'; return }
      try {
        const buf = await downloadFileFromDrive(r.cvDriveId)
        const kind = detectCvKind(buf)
        r.cvType = kind === 'pdf' ? ((await isScannedPdf(buf)) ? 'scanned PDF' : 'PDF') : kind === 'docx' ? 'DOCX' : 'unsupported'
      } catch (err) {
        r.cvType = `unreadable (${cvParseErrorReason(err)})`
      }
    })
    const groups = new Map<string, number>()
    for (const r of rows) groups.set(`${r.source}|${r.cvType}`, (groups.get(`${r.source}|${r.cvType}`) ?? 0) + 1)
    console.table([...groups.entries()].sort().map(([k, n]) => { const [source, cvType] = k.split('|'); return { source, 'CV type': cvType, candidates: n } }))
    console.table(rows.map((r) => ({ id: r.id, name: r.name, source: r.source, 'CV type': r.cvType })))
    console.log(`\nTotal: ${rows.length}. Run with --apply to parse the ones with a CV.`)
    return
  }

  const summary = { parsed: 0, noExperienceInCv: 0, noCv: 0, failed: new Map<string, number>() }
  let done = 0
  await pool(rows, 2, async (r) => {
    const res = await fillCvExperienceFromDrive(r.id)
    done++
    if (res.status === 'filled' || res.status === 'already') summary.parsed++
    else if (res.status === 'no-cv') summary.noCv++
    else if (res.status === 'no-experience-in-cv') summary.noExperienceInCv++
    else {
      summary.failed.set(res.reason, (summary.failed.get(res.reason) ?? 0) + 1)
      console.error(`  FAILED ${r.id} (${r.name}): ${res.reason}`)
    }
    if (done % 10 === 0) console.log(`  … ${done}/${rows.length}`)
  })

  const failedTotal = [...summary.failed.values()].reduce((a, b) => a + b, 0)
  console.log(`\nSummary: parsed ${summary.parsed} · no experience found in CV ${summary.noExperienceInCv} · no CV ${summary.noCv} · failed ${failedTotal}`)
  if (failedTotal > 0) console.table([...summary.failed.entries()].map(([reason, n]) => ({ reason, candidates: n })))
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => db.$disconnect())
