// Usage: npx tsx scripts/diagnose-recruiter-month.ts "Adriana" 2026-09
import { db } from '../lib/db'

const LATER = ['MANAGER_INTERVIEW', 'CLIENT_INTERVIEW', 'OFFER', 'HIRED']
const fmt = (d: Date | null | undefined) => (d ? d.toISOString().replace('T', ' ').slice(0, 16) : '—')

async function main() {
  const [nameArg, month] = process.argv.slice(2)
  if (!nameArg || !/^\d{4}-\d{2}$/.test(month ?? '')) throw new Error('Usage: <recruiter name> <YYYY-MM>')
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  const inMonth = (d: Date | null | undefined) => !!d && d >= start && d <= end

  const recruiter = await db.user.findFirst({
    where: { name: { contains: nameArg, mode: 'insensitive' }, role: 'RECRUITER' },
    select: { id: true, name: true, email: true },
  })
  if (!recruiter) throw new Error(`No RECRUITER matching "${nameArg}"`)
  console.log(`Recruiter: ${recruiter.name} <${recruiter.email}>  Month: ${month}\n`)

  const cps = await db.candidatePosition.findMany({
    where: {
      recruiterId: recruiter.id,
      interviews: { some: { stage: 'SCREENING', decision: 'ADVANCE' } },
    },
    include: {
      candidate: { select: { firstName: true, lastName: true } },
      position: { select: { title: true } },
      interviews: { orderBy: { roundNumber: 'asc' } },
      stageHistory: { orderBy: { movedAt: 'asc' } },
    },
  })

  for (const cp of cps) {
    const tech = cp.interviews.filter((i) => i.stage === 'TECHNICAL_INTERVIEW')
    const monthMoves = cp.stageHistory.filter((h) => inMonth(h.movedAt))
    const screen = cp.interviews.find((i) => i.stage === 'SCREENING' && i.decision === 'ADVANCE')
    const withdrawnAt = cp.stageHistory.find((h) => h.toStage === 'WITHDRAWN')?.movedAt ?? null

    const oldPass = tech.some((i) => i.decision === 'ADVANCE' && inMonth(i.decidedAt ?? i.updatedAt))
    const oldFail = tech.some((i) => i.decision === 'REJECT' && inMonth(i.decidedAt ?? i.updatedAt))
    const movedPast = monthMoves.some((h) => h.fromStage === 'TECHNICAL_INTERVIEW' && LATER.includes(h.toStage))
    const newPass = oldPass || movedPast
    const verdict = (p: boolean, f: boolean) => (p ? 'PASS' : f ? 'FAIL' : 'not counted')

    console.log(`■ ${cp.candidate.firstName} ${cp.candidate.lastName} — ${cp.position.title}`)
    console.log(`  current: stage=${cp.stage} status=${cp.status}  screened ADVANCE ${fmt(screen?.decidedAt ?? screen?.updatedAt)}`)
    if (tech.length === 0) console.log('  tech rounds: none')
    for (const t of tech) {
      console.log(`  tech round ${t.roundNumber} "${t.roundLabel}": status=${t.status} decision=${t.decision ?? '—'} decidedAt=${fmt(t.decidedAt)} updatedAt=${fmt(t.updatedAt)}`)
    }
    if (monthMoves.length === 0) console.log('  stage moves in month: none')
    for (const h of monthMoves) console.log(`  move ${fmt(h.movedAt)}: ${h.fromStage ?? '∅'} → ${h.toStage}`)
    if (withdrawnAt) console.log(`  withdrawn at ${fmt(withdrawnAt)}`)
    console.log(`  old rule: ${verdict(oldPass, oldFail)}   new rule: ${verdict(newPass, oldFail)}\n`)
  }

  const hires = await db.stageHistory.findMany({
    where: { toStage: 'HIRED', movedAt: { gte: start, lte: end }, candidatePosition: { recruiterId: recruiter.id } },
    include: { candidatePosition: { include: { candidate: { select: { firstName: true, lastName: true } } } } },
    orderBy: { movedAt: 'asc' },
  })
  console.log(`HIRED stage moves in month: ${hires.length}, distinct candidate-positions: ${new Set(hires.map((h) => h.candidatePositionId)).size}`)
  for (const h of hires) {
    const c = h.candidatePosition.candidate
    console.log(`  ${c.firstName} ${c.lastName}  ${fmt(h.movedAt)}  cp=${h.candidatePositionId}`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
