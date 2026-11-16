// One-time repair of duplicated last names on candidates created by the Redeployment sync
// ("Juliana Martinez Martinez"): recomputes firstName from the roster values kept on the profile.
//
//   npx tsx scripts/fix-redeployment-names.ts            dry run (default): print the table, change nothing
//   npx tsx scripts/fix-redeployment-names.ts --apply    update firstName where it differs
//
// Only candidates with source REDEPLOYMENT that have a RedeploymentProfile (created by the sync). Candidates that
// already existed and were linked keep their own data. Only firstName is ever changed.
import { db } from '../lib/db'
import { redeploymentFirstName } from '../lib/redeployment-names'

const apply = process.argv.includes('--apply')

async function main() {
  const candidates = await db.candidate.findMany({
    where: { sourcedByType: 'REDEPLOYMENT', redeploymentProfile: { isNot: null } },
    select: {
      id: true, firstName: true, lastName: true,
      redeploymentProfile: { select: { rosterId: true, firstName: true, lastName: true, preferredName: true } },
    },
    orderBy: { lastName: 'asc' },
  })

  const rows: { rosterId: string; current: string; next: string }[] = []
  for (const c of candidates) {
    const p = c.redeploymentProfile!
    const next = redeploymentFirstName(p)
    if (!next || next === c.firstName) continue
    rows.push({ rosterId: p.rosterId, current: `${c.firstName} ${c.lastName}`.trim(), next: `${next} ${c.lastName}`.trim() })
    if (apply) await db.candidate.update({ where: { id: c.id }, data: { firstName: next } })
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${candidates.length} redeployment-created candidate(s) checked, ${rows.length} to fix\n`)
  if (rows.length > 0) console.table(rows.map((r) => ({ rosterId: r.rosterId, 'current full name': r.current, '→ new full name': r.next })))
  if (!apply && rows.length > 0) console.log('\nRun with --apply to update these first names.')
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => db.$disconnect())
