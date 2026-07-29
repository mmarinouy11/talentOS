/**
 * Backfill Candidate.cvExperience / cvEducation / skills from the original
 * CV file already stored in Google Drive (cvDriveId), for candidates whose
 * cvExperience is still empty — added via bulk-import or before this field
 * existed.
 *
 * Run from project root:
 *   npx tsx scripts/backfill-cv-experience.ts
 *   npx tsx scripts/backfill-cv-experience.ts --apply
 *   npx tsx scripts/backfill-cv-experience.ts --apply --limit=10
 *
 * Without --apply, prints counts only (dry run). --limit caps how many
 * candidates are processed — use it for a first test run before the full batch.
 *
 * Requires ANTHROPIC_API_KEY, GOOGLE_SERVICE_ACCOUNT_KEY, and DATABASE_URL
 * in .env.local (loaded automatically via dotenv).
 */

import path from 'path'
import { config } from 'dotenv'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { downloadFileFromDrive } from '../lib/google'
import { parseCvFromBuffer } from '../lib/cv-parser'

const db = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })
const apply = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined

async function main() {
  const candidates = await db.candidate.findMany({
    where: { deletedAt: null, cvDriveId: { not: null } },
    select: { id: true, cvDriveId: true, cvExperience: true, cvEducation: true, skills: true },
  })

  const needsBackfill = candidates.filter(
    (c) => !Array.isArray(c.cvExperience) || (c.cvExperience as unknown[]).length === 0
  )
  const toProcess = limit ? needsBackfill.slice(0, limit) : needsBackfill

  console.log(`\n=== Backfill CV Experience ===`)
  console.log(`Candidates with a CV on file : ${candidates.length}`)
  console.log(`Missing cvExperience          : ${needsBackfill.length}`)
  console.log(`Will process this run         : ${toProcess.length}`)

  if (!apply) {
    console.log('\nDry run — pass --apply to execute.')
    return
  }

  let success = 0
  const failures: { id: string; reason: string }[] = []

  for (const c of toProcess) {
    try {
      const buffer = await downloadFileFromDrive(c.cvDriveId!)
      const parsed = await parseCvFromBuffer(buffer)

      const existingSkillsLower = new Set(c.skills.map((s) => s.toLowerCase()))
      const newSkills = (parsed.skills ?? []).filter((s) => !existingSkillsLower.has(s.toLowerCase()))
      const mergedSkills = newSkills.length > 0 ? [...c.skills, ...newSkills] : undefined

      const data: Record<string, unknown> = {}
      if (Array.isArray(parsed.experience) && parsed.experience.length > 0) data.cvExperience = parsed.experience
      if (Array.isArray(parsed.education) && parsed.education.length > 0) data.cvEducation = parsed.education
      if (mergedSkills) data.skills = mergedSkills

      if (Object.keys(data).length > 0) {
        await db.candidate.update({ where: { id: c.id }, data })
      }
      success++
      console.log(`OK   ${c.id} — experience:${(parsed.experience ?? []).length} education:${(parsed.education ?? []).length} new skills:${newSkills.length}`)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      failures.push({ id: c.id, reason })
      console.error(`FAIL ${c.id} — ${reason}`)
    }
  }

  console.log(`\nDone. Success: ${success}, Failed: ${failures.length}`)
  if (failures.length > 0) {
    console.log('Failures (review manually):')
    failures.forEach((f) => console.log(`  ${f.id}: ${f.reason}`))
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
