/**
 * Fix: for REJECTED CandidatePositions, set stage = highest stage reached
 * in their interview rounds (not the backfill default of SCREENING).
 *
 * Run with:
 *   DATABASE_URL=<url> npx tsx scripts/fix-rejected-stage.ts [--positionId <id>]
 *   DATABASE_URL=<url> npx tsx scripts/fix-rejected-stage.ts [--positionId <id>] --apply
 *
 * Without --apply: dry run (shows what will change).
 * Without --positionId: targets ALL positions.
 */

import { db } from "../lib/db"


const apply = process.argv.includes('--apply')
const positionIdArg = (() => {
  const idx = process.argv.indexOf('--positionId')
  return idx !== -1 ? process.argv[idx + 1] : undefined
})()

// Higher = more advanced stage
const STAGE_ORDER: Record<string, number> = {
  OFFER: 6,
  CLIENT_INTERVIEW: 5,
  MANAGER_INTERVIEW: 4,
  TECHNICAL_INTERVIEW: 3,
  SCREENING: 2,
  APPLIED: 1,
}

async function main() {
  const where = {
    status: 'REJECTED' as const,
    ...(positionIdArg ? { positionId: positionIdArg } : {}),
  }

  console.log(positionIdArg
    ? `\nTargeting position: ${positionIdArg}`
    : '\nTargeting ALL positions'
  )

  const cps = await db.candidatePosition.findMany({
    where,
    select: {
      id: true,
      stage: true,
      candidate: { select: { firstName: true, lastName: true } },
      interviews: { select: { stage: true, decision: true } },
    },
  })

  console.log(`Found ${cps.length} REJECTED CandidatePositions\n`)

  const fixes: { id: string; name: string; currentStage: string; correctStage: string }[] = []

  for (const cp of cps) {
    if (!cp.interviews.length) continue

    // Find highest stage reached across all interview rounds
    const highestInterview = cp.interviews.reduce((best, cur) =>
      (STAGE_ORDER[cur.stage] ?? 0) > (STAGE_ORDER[best.stage] ?? 0) ? cur : best
    )
    const correctStage = highestInterview.stage

    if (correctStage !== cp.stage) {
      fixes.push({
        id: cp.id,
        name: `${cp.candidate.firstName} ${cp.candidate.lastName}`,
        currentStage: cp.stage,
        correctStage,
      })
    }
  }

  if (fixes.length === 0) {
    console.log('No stage corrections needed.')
    return
  }

  console.log(`${fixes.length} records need stage correction:`)
  for (const f of fixes) {
    console.log(`  ${f.name.padEnd(30)}  ${f.currentStage.padEnd(22)} → ${f.correctStage}`)
  }

  if (!apply) {
    console.log('\nDry run — pass --apply to execute.')
    return
  }

  console.log('\nApplying...')
  for (const f of fixes) {
    await db.candidatePosition.update({
      where: { id: f.id },
      data: { stage: f.correctStage as never },
    })
  }
  console.log(`Done. Fixed ${fixes.length} records.`)

  // Final stage distribution for the targeted set
  const after = await db.candidatePosition.findMany({
    where,
    select: { stage: true },
  })
  const stageCounts: Record<string, number> = {}
  for (const cp of after) stageCounts[cp.stage] = (stageCounts[cp.stage] ?? 0) + 1
  console.log('\n=== Stage distribution for REJECTED CPs (after fix) ===')
  for (const [stage, n] of Object.entries(stageCounts).sort((a, b) => (STAGE_ORDER[b[0]] ?? 0) - (STAGE_ORDER[a[0]] ?? 0))) {
    console.log(`  ${stage.padEnd(22)}: ${n}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
