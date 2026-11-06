// Re-checks every stored "Better match" suggestion against real fit scores (getOrComputeFitScore).
//
//   npx tsx scripts/recompute-better-match.ts           dry run (default): print the table, change no suggestion
//   npx tsx scripts/recompute-better-match.ts --apply   keep passing suggestions with their real score, clear the rest
//
// A suggestion is kept only if real(suggested) >= round(current fitScore) + BETTER_MATCH_MIN_DELTA and the
// suggested position is OPEN, not deleted and not fulfilled. The current score is CandidatePosition.fitScore,
// i.e. what the Fit Score panel shows. Real scores missing from FitScoreCache are computed with Claude and
// cached, also in a dry run (the cache is not a suggestion and keeps later scorings consistent).
import { db } from '../lib/db'
import { getOrComputeFitScore, getBetterMatchMinDelta } from '../lib/fit-scorer'
import { HIRED_CANDIDATE_POSITION_WHERE, isPositionFulfilled } from '../lib/position-fulfillment'

const apply = process.argv.includes('--apply')

async function main() {
  const minDelta = await getBetterMatchMinDelta()
  const cps = await db.candidatePosition.findMany({
    where: { suggestedPositionId: { not: null } },
    select: {
      id: true, candidateId: true, fitScore: true, suggestedPositionId: true, suggestedPositionScore: true,
      candidate: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${cps.length} stored suggestion(s), BETTER_MATCH_MIN_DELTA = ${minDelta}\n`)

  const rows: Record<string, string | number>[] = []
  let kept = 0, cleared = 0, failed = 0

  for (const cp of cps) {
    const name = `${cp.candidate.firstName} ${cp.candidate.lastName}`.trim()
    const current = cp.fitScore != null ? Math.round(cp.fitScore) : null
    const pos = await db.position.findFirst({
      where: { id: cp.suggestedPositionId!, deletedAt: null, status: 'OPEN' },
      select: { title: true, headcount: true, _count: { select: { candidatePositions: { where: HIRED_CANDIDATE_POSITION_WHERE } } } },
    })
    const available = !!pos && !isPositionFulfilled(pos.headcount, pos._count.candidatePositions)

    let real: number | null = null
    let reason: string | null = null
    try {
      const r = available ? await getOrComputeFitScore(cp.candidateId, cp.suggestedPositionId!) : null
      if (r) { real = Math.round(r.fitScore); reason = r.fitSummary.trim() || null }
    } catch (err) {
      failed++
      console.error(`  scoring failed for ${cp.id}:`, err instanceof Error ? err.message : err)
      continue // leave untouched; re-run later
    }

    const keep = available && current != null && real != null && real >= current + minDelta
    const note = !available ? 'position not open/fulfilled' : current == null ? 'no current score' : ''
    keep ? kept++ : cleared++
    rows.push({
      candidate: name, position: pos?.title ?? '(gone)', current: current ?? '-',
      oldEstimate: cp.suggestedPositionScore ?? '-', realSuggested: real ?? '-',
      result: keep ? 'kept' : 'cleared', note,
    })

    if (apply) {
      await db.candidatePosition.update({
        where: { id: cp.id },
        data: keep
          ? { suggestedPositionScore: real, suggestedPositionReason: reason }
          : { suggestedPositionId: null, suggestedPositionScore: null, suggestedPositionReason: null },
      })
    }
  }

  console.table(rows)
  console.log(`\nkept ${kept}, cleared ${cleared}${failed ? `, failed ${failed} (unchanged)` : ''}${apply ? '' : ' — dry run, no suggestions changed'}`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(() => db.$disconnect())
