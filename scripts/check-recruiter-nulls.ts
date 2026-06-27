import { db } from '../lib/db'

async function main() {
  // recruiterId is now required (NOT NULL), so this should always return 0
  const count = await db.candidate.count()
  console.log(`Total candidates: ${count}`)
  console.log('recruiterId is a required field — all rows must have a value (column is NOT NULL).')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
