import { db } from '../lib/db'

async function main() {
  // Find interviews that are PENDING but have a decision set (contradictory)
  const wrong = await db.interview.findMany({
    where: {
      status: 'PENDING',
      decision: { not: null },
      candidatePosition: { positionId: 'cmqk2zptl0000tpsdphfgqvyq' }
    },
    include: { candidatePosition: { include: { candidate: true } } }
  })

  console.log(`Found ${wrong.length} interviews with PENDING status but decision set:`)
  for (const i of wrong) {
    const name = i.candidatePosition.candidate.firstName + ' ' + i.candidatePosition.candidate.lastName
    console.log(`  ${name}: ${i.stage} / ${i.status} / ${i.decision}`)
  }

  if (process.argv.includes('--apply')) {
    await db.interview.updateMany({
      where: {
        status: 'PENDING',
        decision: { not: null },
        candidatePosition: { positionId: 'cmqk2zptl0000tpsdphfgqvyq' }
      },
      data: { decision: null }
    })
    console.log(`\nCleared decision from ${wrong.length} records.`)
  } else {
    console.log('\nDry run — pass --apply to execute.')
  }
}
main().catch(console.error).finally(() => process.exit(0))
