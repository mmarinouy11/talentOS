import { db } from '../lib/db'
async function main() {
  const cps = await db.candidatePosition.findMany({
    where: { positionId: 'cmqk2zptl0000tpsdphfgqvyq', status: 'ACTIVE' },
    include: {
      candidate: { select: { firstName: true, lastName: true } },
      interviews: { select: { stage: true, status: true, decision: true }, orderBy: { createdAt: 'asc' } }
    },
    take: 15
  })
  for (const cp of cps) {
    const name = cp.candidate.firstName + ' ' + cp.candidate.lastName
    const rounds = cp.interviews.map(i => `${i.stage}/${i.status}/${i.decision || '-'}`).join(' → ')
    console.log(`${name}: stage=${cp.stage} | ${rounds || 'no rounds'}`)
  }
}
main().catch(console.error).finally(() => process.exit(0))
