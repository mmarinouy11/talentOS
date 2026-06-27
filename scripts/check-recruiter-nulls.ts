import { db } from '../lib/db'

async function main() {
  const count = await db.candidate.count({ where: { recruiterId: null } })
  console.log(`Candidates with NULL recruiterId: ${count}`)

  if (count > 0) {
    const samples = await db.candidate.findMany({
      where: { recruiterId: null },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 5,
    })
    console.log('Sample affected candidates:', samples)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
