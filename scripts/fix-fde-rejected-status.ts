/**
 * Targeted fix: set CandidatePosition.status = REJECTED for specific
 * candidates in the FDE position who were misclassified as ACTIVE.
 *
 * Run with:
 *   DATABASE_URL=<real-url> npx tsx scripts/fix-fde-rejected-status.ts
 *   DATABASE_URL=<real-url> npx tsx scripts/fix-fde-rejected-status.ts --apply
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')

// Name fragments to match (case-insensitive). Enough to be unambiguous.
const TARGET_NAMES = [
  { first: 'Francisco', last: 'V' },
  { first: 'Manuel', last: 'Grot' },
  { first: 'Manuel', last: 'Gorut' },
  { first: 'Giovanni', last: 'G' },
  { first: 'Tais', last: 'Contreras' },
  { first: 'Gualberto', last: 'Gomez' },
  { first: 'Andres', last: 'Perez' },
]

async function main() {
  // Find the FDE position (title contains "FDE" or "Full")
  const positions = await db.position.findMany({
    where: {
      deletedAt: null,
      OR: [
        { title: { contains: 'FDE', mode: 'insensitive' } },
        { title: { contains: 'Full', mode: 'insensitive' } },
      ],
    },
    select: { id: true, title: true },
  })

  if (positions.length === 0) {
    console.error('No FDE position found. Check the position title.')
    process.exit(1)
  }

  console.log('\nMatched positions:')
  for (const p of positions) console.log(`  ${p.id}  ${p.title}`)

  const positionIds = positions.map((p) => p.id)

  // Load all CandidatePositions for these positions with candidate + interviews
  const cps = await db.candidatePosition.findMany({
    where: { positionId: { in: positionIds } },
    select: {
      id: true,
      status: true,
      stage: true,
      positionId: true,
      candidate: { select: { firstName: true, lastName: true, email: true } },
      interviews: { select: { decision: true, stage: true, status: true } },
    },
  })

  console.log(`\nTotal CandidatePositions in FDE: ${cps.length}`)

  // Match each target name
  const toFix: typeof cps = []

  for (const target of TARGET_NAMES) {
    const matches = cps.filter((cp) => {
      const fn = cp.candidate.firstName.toLowerCase()
      const ln = cp.candidate.lastName.toLowerCase()
      return (
        fn.startsWith(target.first.toLowerCase()) &&
        ln.toLowerCase().startsWith(target.last.toLowerCase())
      )
    })

    if (matches.length === 0) {
      console.warn(`  WARNING: no match for ${target.first} ${target.last}`)
    } else {
      for (const m of matches) {
        const anyReject = m.interviews.some((i) => i.decision === 'REJECT')
        const rounds = m.interviews.map((i) => `${i.stage}/${i.status}/${i.decision ?? 'no-decision'}`).join(', ')
        console.log(`\n  ${m.candidate.firstName} ${m.candidate.lastName} (${m.candidate.email})`)
        console.log(`    current status : ${m.status}`)
        console.log(`    rounds         : ${rounds || '(none)'}`)
        console.log(`    any REJECT?    : ${anyReject}`)
        if (anyReject || m.status !== 'REJECTED') {
          toFix.push(m)
        }
      }
    }
  }

  const actuallyWrong = toFix.filter((cp) => cp.status !== 'REJECTED')
  console.log(`\n=== ${actuallyWrong.length} records to fix (currently not REJECTED) ===`)
  for (const cp of actuallyWrong) {
    console.log(`  ${cp.id}  ${cp.candidate.firstName} ${cp.candidate.lastName}`)
  }

  if (!apply) {
    console.log('\nDry run — pass --apply to execute.')
    return
  }

  if (actuallyWrong.length === 0) {
    console.log('Nothing to update.')
    return
  }

  console.log('\nApplying...')
  await db.candidatePosition.updateMany({
    where: { id: { in: actuallyWrong.map((cp) => cp.id) } },
    data: { status: 'REJECTED' },
  })
  console.log(`Done. Marked ${actuallyWrong.length} CandidatePositions as REJECTED.`)

  // Final counts for FDE position
  const finalCps = await db.candidatePosition.findMany({
    where: { positionId: { in: positionIds } },
    select: { status: true },
  })
  const counts = { ACTIVE: 0, REJECTED: 0, HIRED: 0, WITHDRAWN: 0 } as Record<string, number>
  for (const cp of finalCps) counts[cp.status] = (counts[cp.status] ?? 0) + 1
  console.log('\n=== Final FDE counts ===')
  for (const [status, n] of Object.entries(counts)) console.log(`  ${status.padEnd(10)}: ${n}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
