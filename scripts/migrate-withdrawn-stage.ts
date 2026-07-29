/**
 * One-time migration: set stage = 'WITHDRAWN' for candidates already in
 * status='WITHDRAWN' (set by the old on_hold action) whose stage still
 * holds the old pre-hold value.
 *
 * Run AFTER the Railway deploy that adds WITHDRAWN to the Stage enum:
 *   npx tsx scripts/migrate-withdrawn-stage.ts
 *   npx tsx scripts/migrate-withdrawn-stage.ts --apply
 *
 * Without --apply, prints counts only (dry run).
 */

import path from 'path'
import { config } from 'dotenv'
config({ path: path.resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const db = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) })
const apply = process.argv.includes('--apply')

async function main() {
  const affected = await db.$queryRaw<{ id: string; stage: string; positionId: string }[]>`
    SELECT id, stage, "positionId" FROM "CandidatePosition"
    WHERE status = 'WITHDRAWN' AND stage != 'WITHDRAWN'
  `

  console.log(`\n=== Migrate WITHDRAWN stage ===`)
  console.log(`Candidates with status=WITHDRAWN but stage != WITHDRAWN: ${affected.length}`)

  if (!apply) {
    console.log('\nDry run — pass --apply to execute.')
    return
  }

  const updated = await db.$executeRaw`
    UPDATE "CandidatePosition" SET stage = 'WITHDRAWN'
    WHERE status = 'WITHDRAWN' AND stage != 'WITHDRAWN'
  `

  console.log(`Updated ${updated} records.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
