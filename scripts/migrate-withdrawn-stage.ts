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

const db = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const affected = await db.candidatePosition.findMany({
    where: { status: 'WITHDRAWN', stage: { not: 'WITHDRAWN' } },
    select: { id: true, stage: true, positionId: true },
  })

  console.log(`\n=== Migrate WITHDRAWN stage ===`)
  console.log(`Candidates with status=WITHDRAWN but stage != WITHDRAWN: ${affected.length}`)

  if (!apply) {
    console.log('\nDry run — pass --apply to execute.')
    return
  }

  const result = await db.candidatePosition.updateMany({
    where: { status: 'WITHDRAWN', stage: { not: 'WITHDRAWN' } },
    data: { stage: 'WITHDRAWN' },
  })

  console.log(`Updated ${result.count} records.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
