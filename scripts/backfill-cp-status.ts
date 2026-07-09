/**
 * Backfill CandidatePosition.status from existing stage/interview data.
 *
 * Run with:
 *   DATABASE_URL=<real-url> npx tsx scripts/backfill-cp-status.ts
 *   DATABASE_URL=<real-url> npx tsx scripts/backfill-cp-status.ts --apply
 *
 * Without --apply, prints counts only (dry run).
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const allCPs = await db.candidatePosition.findMany({
    select: {
      id: true,
      stage: true,
      interviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { decision: true },
      },
      stageHistory: {
        orderBy: { movedAt: 'desc' },
        take: 10,
        select: { fromStage: true, toStage: true, movedAt: true },
      },
    },
  })

  const decisions: { id: string; status: 'ACTIVE' | 'REJECTED' | 'HIRED' | 'WITHDRAWN'; prevStage?: string }[] = []

  for (const cp of allCPs) {
    // stage === HIRED → HIRED
    if (cp.stage === 'HIRED') {
      decisions.push({ id: cp.id, status: 'HIRED' })
      continue
    }

    // stage === REJECTED → status=REJECTED, find previous stage
    if (cp.stage === 'REJECTED') {
      // Find the history entry that moved INTO REJECTED, use its fromStage
      const intoRejected = cp.stageHistory.find((h) => h.toStage === 'REJECTED')
      const prevStage = intoRejected?.fromStage ?? 'SCREENING'
      decisions.push({ id: cp.id, status: 'REJECTED', prevStage })
      continue
    }

    // Most recent interview has REJECT decision → status=REJECTED
    if (cp.interviews[0]?.decision === 'REJECT') {
      decisions.push({ id: cp.id, status: 'REJECTED' })
      continue
    }

    // Everything else → ACTIVE
    decisions.push({ id: cp.id, status: 'ACTIVE' })
  }

  const counts = { ACTIVE: 0, REJECTED: 0, HIRED: 0, WITHDRAWN: 0 }
  for (const d of decisions) counts[d.status]++

  console.log('\n=== Backfill counts ===')
  console.log(`ACTIVE    : ${counts.ACTIVE}`)
  console.log(`REJECTED  : ${counts.REJECTED}`)
  console.log(`HIRED     : ${counts.HIRED}`)
  console.log(`WITHDRAWN : ${counts.WITHDRAWN}`)
  console.log(`TOTAL     : ${allCPs.length}`)

  const stageFixups = decisions.filter((d) => d.prevStage)
  if (stageFixups.length) {
    console.log(`\nWill also fix stage for ${stageFixups.length} records (stage was REJECTED → set to previous stage):`)
    for (const d of stageFixups) {
      console.log(`  ${d.id}: stage → ${d.prevStage}`)
    }
  }

  if (!apply) {
    console.log('\nDry run — pass --apply to execute.')
    return
  }

  console.log('\nApplying...')
  let updated = 0
  for (const d of decisions) {
    const data: Record<string, unknown> = { status: d.status }
    if (d.prevStage) data.stage = d.prevStage
    await db.candidatePosition.update({ where: { id: d.id }, data })
    updated++
  }
  console.log(`Done. Updated ${updated} records.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
