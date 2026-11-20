// Repairs interview round labels/numbers inflated by cancelled interviews ("Screening - Round 2" when the only
// earlier Screening was cancelled).
//
//   npx tsx scripts/fix-interview-rounds.ts            dry run (default): print what would change
//   npx tsx scripts/fix-interview-rounds.ts --apply    write the changes
//
// Per candidate-position, non-cancelled interviews are renumbered in creation order ignoring cancelled ones:
// roundLabel per stage ("Screening", "Screening - Round 2", …) and roundNumber overall (1, 2, …), the same rules
// new interviews follow. Only auto-generated labels ("<Stage>" or "<Stage> - Round N") are relabelled; custom
// labels keep their text. Cancelled interviews and everything else are never touched.
import { db } from '../lib/db'
import { INTERVIEW_BASE_LABELS, interviewRoundLabel } from '../lib/interview-display'

const apply = process.argv.includes('--apply')

function isAutoLabel(label: string, base: string) {
  return label === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} - Round \\d+$`).test(label)
}

async function main() {
  const cps = await db.candidatePosition.findMany({
    where: { interviews: { some: { status: 'CANCELLED' } } },
    select: {
      id: true,
      candidate: { select: { firstName: true, lastName: true } },
      position: { select: { title: true } },
      interviews: { orderBy: { createdAt: 'asc' }, select: { id: true, stage: true, status: true, roundLabel: true, roundNumber: true } },
    },
  })

  const rows: { candidate: string; position: string; old: string; next: string; id: string; roundNumber: number; oldRoundNumber: number }[] = []
  for (const cp of cps) {
    const live = cp.interviews.filter((i) => i.status !== 'CANCELLED')
    const perStage = new Map<string, number>()
    live.forEach((iv, index) => {
      const base = INTERVIEW_BASE_LABELS[iv.stage] ?? iv.stage
      const nth = perStage.get(iv.stage) ?? 0
      perStage.set(iv.stage, nth + 1)
      const nextLabel = isAutoLabel(iv.roundLabel, base) ? interviewRoundLabel(base, nth) : iv.roundLabel
      const nextNumber = index + 1
      if (nextLabel !== iv.roundLabel || nextNumber !== iv.roundNumber) {
        rows.push({
          id: iv.id, candidate: `${cp.candidate.firstName} ${cp.candidate.lastName}`.trim(), position: cp.position.title,
          old: iv.roundLabel, next: nextLabel, roundNumber: nextNumber, oldRoundNumber: iv.roundNumber,
        })
      }
    })
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${cps.length} candidate-position(s) with cancelled interviews, ${rows.length} interview(s) to fix\n`)
  if (rows.length > 0) {
    console.table(rows.map((r) => ({
      candidate: r.candidate, position: r.position,
      'old label → new label': r.old === r.next ? `${r.old} (unchanged)` : `${r.old} → ${r.next}`,
      'round #': r.oldRoundNumber === r.roundNumber ? String(r.roundNumber) : `${r.oldRoundNumber} → ${r.roundNumber}`,
    })))
  }
  if (apply) {
    for (const r of rows) await db.interview.update({ where: { id: r.id }, data: { roundLabel: r.next, roundNumber: r.roundNumber } })
    console.log(`\nUpdated ${rows.length} interview(s).`)
  } else if (rows.length > 0) {
    console.log('\nRun with --apply to write these changes.')
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => db.$disconnect())
