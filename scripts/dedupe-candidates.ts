// Candidate dedup cleanup.
//
//   npx tsx scripts/dedupe-candidates.ts                         dry run: Phase A counts + duplicate summary, no writes
//   npx tsx scripts/dedupe-candidates.ts --report                also writes reports/duplicates-YYYY-MM-DD.csv
//   npx tsx scripts/dedupe-candidates.ts --apply                 Phase A backfill only (linkedinHandle, placeholder emails → null)
//   npx tsx scripts/dedupe-candidates.ts --apply --groups=certain        Phase A + merge every CERTAIN group
//   npx tsx scripts/dedupe-candidates.ts --apply --approve=file.csv      Phase A + merge only the groupIds listed in file.csv
//
// Merging never runs without --apply plus --groups=certain or --approve=<file>.
// Group ids are a hash of the member candidate ids, so ids from a --report run stay valid
// as long as the group's membership has not changed.

import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import path from 'path'
import type { Prisma, Stage } from '@prisma/client'
import { db } from '../lib/db'
import { normalizeLinkedinHandle } from '../lib/linkedin'
import { isPlaceholderEmail } from '../lib/import-jobs'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const REPORT = args.includes('--report')
const GROUPS_CERTAIN = args.includes('--groups=certain')
const APPROVE_FILE = args.find((a) => a.startsWith('--approve='))?.slice('--approve='.length)
const MERGE = APPLY && (GROUPS_CERTAIN || !!APPROVE_FILE)

const today = new Date().toISOString().slice(0, 10)
const REPORTS_DIR = path.join(process.cwd(), 'reports')
const MERGE_LOG = path.join(REPORTS_DIR, `merge-log-${today}.txt`)

function log(line: string) {
  console.log(line)
  if (MERGE) appendFileSync(MERGE_LOG, line + '\n')
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeName(first: string, last: string): string {
  return `${first} ${last}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

const phoneDigits = (p: string | null) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 7 ? d : null
}

const realEmail = (e: string | null) => (e && !isPlaceholderEmail(e) ? e.trim().toLowerCase() : null)

const STAGE_RANK: Record<Stage, number> = {
  REJECTED: -1, WITHDRAWN: -1,
  APPLIED: 0, SCREENING: 1, TECHNICAL_INTERVIEW: 2, MANAGER_INTERVIEW: 3,
  CLIENT_INTERVIEW: 4, OFFER: 5, HIRED: 6,
}

class UnionFind {
  parent = new Map<string, string>()
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    const p = this.parent.get(x)!
    if (p === x) return x
    const root = this.find(p)
    this.parent.set(x, root)
    return root
  }
  union(a: string, b: string) { this.parent.set(this.find(a), this.find(b)) }
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ─── Load ───────────────────────────────────────────────────────────────────

type Cand = {
  id: string; firstName: string; lastName: string
  email: string | null; phone: string | null; country: string | null
  linkedinUrl: string | null; linkedinHandle: string | null; createdAt: Date
  positionsCount: number; interviewsCount: number
  // values after Phase A, computed in memory so the report reflects the cleaned data
  effEmail: string | null; effHandle: string | null
}

async function loadCandidates(): Promise<Cand[]> {
  const rows = await db.candidate.findMany({
    where: { deletedAt: null },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true, country: true,
      linkedinUrl: true, linkedinHandle: true, createdAt: true,
      candidatePositions: { select: { _count: { select: { interviews: true } } } },
    },
  })
  return rows.map((r) => ({
    id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone,
    country: r.country, linkedinUrl: r.linkedinUrl, linkedinHandle: r.linkedinHandle, createdAt: r.createdAt,
    positionsCount: r.candidatePositions.length,
    interviewsCount: r.candidatePositions.reduce((s, cp) => s + cp._count.interviews, 0),
    effEmail: realEmail(r.email),
    effHandle: normalizeLinkedinHandle(r.linkedinUrl),
  }))
}

// ─── Phase A: backfill ──────────────────────────────────────────────────────

async function phaseA(cands: Cand[]) {
  const handleUpdates = cands.filter((c) => c.effHandle !== c.linkedinHandle)
  const placeholderEmails = cands.filter((c) => c.email && isPlaceholderEmail(c.email))
  console.log('\n== Phase A — backfill ==')
  console.log(`  linkedinHandle to set/update: ${handleUpdates.length}`)
  console.log(`  placeholder emails to clear:  ${placeholderEmails.length}`)
  if (!APPLY) { console.log('  (dry run — no changes written; use --apply)'); return }

  for (const c of handleUpdates) {
    await db.candidate.update({ where: { id: c.id }, data: { linkedinHandle: c.effHandle } })
  }
  for (const c of placeholderEmails) {
    await db.candidate.update({ where: { id: c.id }, data: { email: null } })
  }
  console.log(`  applied: ${handleUpdates.length} handles, ${placeholderEmails.length} emails cleared`)
}

// ─── Phase B: grouping ──────────────────────────────────────────────────────

type Group = { groupId: string; type: 'CERTAIN' | 'POSSIBLE'; members: Cand[]; primary: Cand }

// Most CandidatePositions, then most interviews, then oldest
function rankCandidates(members: Cand[]): Cand[] {
  return [...members].sort((a, b) =>
    b.positionsCount - a.positionsCount ||
    b.interviewsCount - a.interviewsCount ||
    a.createdAt.getTime() - b.createdAt.getTime(),
  )
}
const pickPrimary = (members: Cand[]) => rankCandidates(members)[0]

function makeGroup(type: Group['type'], members: Cand[]): Group {
  const hash = createHash('sha1').update(members.map((m) => m.id).sort().join(',')).digest('hex').slice(0, 10)
  return { groupId: `${type === 'CERTAIN' ? 'C' : 'P'}-${hash}`, type, members, primary: pickPrimary(members) }
}

function buildGroups(cands: Cand[]): Group[] {
  const byId = new Map(cands.map((c) => [c.id, c]))

  // CERTAIN: same real email (case-insensitive) or same LinkedIn handle, transitively
  const uf = new UnionFind()
  const firstByKey = new Map<string, string>()
  for (const c of cands) {
    uf.find(c.id)
    for (const key of [c.effEmail && `e:${c.effEmail}`, c.effHandle && `h:${c.effHandle}`]) {
      if (!key) continue
      const seen = firstByKey.get(key)
      if (seen) uf.union(seen, c.id)
      else firstByKey.set(key, c.id)
    }
  }
  const certainSets = new Map<string, string[]>()
  for (const c of cands) {
    const root = uf.find(c.id)
    certainSets.set(root, [...(certainSets.get(root) ?? []), c.id])
  }
  const groups: Group[] = []
  const inCertain = new Set<string>()
  for (const ids of certainSets.values()) {
    if (ids.length < 2) continue
    ids.forEach((id) => inCertain.add(id))
    groups.push(makeGroup('CERTAIN', ids.map((id) => byId.get(id)!)))
  }

  // POSSIBLE: same normalized full name AND (same phone digits OR same country), outside CERTAIN groups
  const byName = new Map<string, Cand[]>()
  for (const c of cands) {
    if (inCertain.has(c.id)) continue
    const n = normalizeName(c.firstName, c.lastName)
    if (!n) continue
    byName.set(n, [...(byName.get(n) ?? []), c])
  }
  for (const bucket of byName.values()) {
    if (bucket.length < 2) continue
    const nuf = new UnionFind()
    bucket.forEach((c) => nuf.find(c.id))
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i], b = bucket[j]
        const samePhone = phoneDigits(a.phone) != null && phoneDigits(a.phone) === phoneDigits(b.phone)
        const sameCountry = !!a.country && a.country.trim().toLowerCase() === b.country?.trim().toLowerCase()
        if (samePhone || sameCountry) nuf.union(a.id, b.id)
      }
    }
    const sets = new Map<string, Cand[]>()
    for (const c of bucket) {
      const r = nuf.find(c.id)
      sets.set(r, [...(sets.get(r) ?? []), c])
    }
    for (const members of sets.values()) if (members.length >= 2) groups.push(makeGroup('POSSIBLE', members))
  }
  return groups
}

function summarize(groups: Group[]) {
  console.log('\n== Phase B — duplicate groups ==')
  for (const type of ['CERTAIN', 'POSSIBLE'] as const) {
    const gs = groups.filter((g) => g.type === type)
    const n = gs.reduce((s, g) => s + g.members.length, 0)
    console.log(`  ${type.padEnd(8)}: ${gs.length} groups, ${n} candidates (${n - gs.length} would be merged away)`)
  }
}

function writeReport(groups: Group[]) {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const file = path.join(REPORTS_DIR, `duplicates-${today}.csv`)
  const header = ['groupId', 'groupType', 'candidateId', 'name', 'email', 'linkedinHandle', 'phone', 'country',
    'positionsCount', 'interviewsCount', 'createdAt', 'proposedPrimary']
  const lines = [header.join(',')]
  for (const g of groups) {
    for (const m of [g.primary, ...g.members.filter((x) => x.id !== g.primary.id)]) {
      lines.push([
        g.groupId, g.type, m.id, `${m.firstName} ${m.lastName}`.trim(), m.effEmail, m.effHandle, m.phone, m.country,
        m.positionsCount, m.interviewsCount, m.createdAt, m.id === g.primary.id ? 'Y' : 'N',
      ].map(csvCell).join(','))
    }
  }
  writeFileSync(file, lines.join('\n') + '\n')
  console.log(`\n  report written: ${path.relative(process.cwd(), file)}`)
}

// ─── Phase C: merge ─────────────────────────────────────────────────────────

function readApprovedGroupIds(file: string): Set<string> {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  const header = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const col = header.indexOf('groupId')
  const rows = col >= 0 ? lines.slice(1) : lines
  const idx = col >= 0 ? col : 0
  return new Set(rows.map((l) => l.split(',')[idx]?.trim().replace(/^"|"$/g, '')).filter(Boolean))
}

const FILL_FIELDS = ['email', 'phone', 'linkedinUrl', 'linkedinHandle', 'country', 'cvDriveId', 'seniority', 'yearsOfExperience', 'summary'] as const

async function mergeGroup(g: Group) {
  const primaryId = g.primary.id
  log(`\n[${g.groupId}] ${g.type} — keep ${primaryId} (${g.primary.firstName} ${g.primary.lastName}); merge ${g.members.length - 1} duplicate(s)`)

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Most substantial duplicates first, so their values win when filling empty primary fields
    const dups = rankCandidates(g.members).filter((m) => m.id !== primaryId)
    for (const dupMeta of dups) {
      const dupId = dupMeta.id
      const dupCps = await tx.candidatePosition.findMany({ where: { candidateId: dupId } })

      for (const dcp of dupCps) {
        const pcp = await tx.candidatePosition.findUnique({
          where: { candidateId_positionId: { candidateId: primaryId, positionId: dcp.positionId } },
        })
        if (!pcp) {
          await tx.candidatePosition.update({ where: { id: dcp.id }, data: { candidateId: primaryId } })
          log(`  moved candidatePosition ${dcp.id} (position ${dcp.positionId}) from ${dupId}`)
          continue
        }
        // Both are in the same position: keep the more advanced one (ties keep the primary's)
        const keepDup = STAGE_RANK[dcp.stage] > STAGE_RANK[pcp.stage]
        const keep = keepDup ? dcp : pcp
        const drop = keepDup ? pcp : dcp
        const [ivs, hist, logs] = await Promise.all([
          tx.interview.updateMany({ where: { candidatePositionId: drop.id }, data: { candidatePositionId: keep.id } }),
          tx.stageHistory.updateMany({ where: { candidatePositionId: drop.id }, data: { candidatePositionId: keep.id } }),
          tx.emailLog.updateMany({ where: { candidatePositionId: drop.id }, data: { candidatePositionId: keep.id } }),
        ])
        const notes = [keep.notes, drop.notes ? `Merged from duplicate candidate-position:\n${drop.notes}` : null]
          .filter(Boolean).join('\n\n') || null
        await tx.candidatePosition.delete({ where: { id: drop.id } })
        await tx.candidatePosition.update({ where: { id: keep.id }, data: { notes, candidateId: primaryId } })
        log(`  position ${dcp.positionId}: kept ${keep.id} (${keep.stage}), deleted ${drop.id} (${drop.stage}); moved ${ivs.count} interviews, ${hist.count} stage history, ${logs.count} email logs`)
      }

      const emailLogs = await tx.emailLog.updateMany({ where: { candidateId: dupId }, data: { candidateId: primaryId } })
      if (emailLogs.count) log(`  moved ${emailLogs.count} email logs from ${dupId}`)

      const [primary, dup] = await Promise.all([
        tx.candidate.findUniqueOrThrow({ where: { id: primaryId } }),
        tx.candidate.findUniqueOrThrow({ where: { id: dupId } }),
      ])
      const data: Prisma.CandidateUpdateInput = {}
      const filled: string[] = []
      for (const f of FILL_FIELDS) {
        const pv = primary[f], dv = dup[f]
        const empty = pv == null || (typeof pv === 'string' && pv.trim() === '')
        if (empty && dv != null && !(typeof dv === 'string' && dv.trim() === '')) {
          ;(data as Record<string, unknown>)[f] = dv
          filled.push(f)
        }
      }
      const union = (a: string[], b: string[]) => {
        const seen = new Set(a.map((s) => s.toLowerCase()))
        return [...a, ...b.filter((s) => !seen.has(s.toLowerCase()) && (seen.add(s.toLowerCase()), true))]
      }
      const skills = union(primary.skills, dup.skills)
      const languages = union(primary.languages, dup.languages)
      if (skills.length !== primary.skills.length) data.skills = skills
      if (languages.length !== primary.languages.length) data.languages = languages

      // email is unique: release it on the duplicate before copying it to the primary
      if (data.email) await tx.candidate.update({ where: { id: dupId }, data: { email: null } })
      if (Object.keys(data).length) {
        await tx.candidate.update({ where: { id: primaryId }, data })
        log(`  filled on primary from ${dupId}: ${[...filled, data.skills ? 'skills' : '', data.languages ? 'languages' : ''].filter(Boolean).join(', ')}`)
      }

      await tx.candidate.delete({ where: { id: dupId } })
      log(`  deleted duplicate candidate ${dupId} (${dup.firstName} ${dup.lastName}, ${dup.email ?? 'no email'})`)
    }
  }, { timeout: 60_000 })
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`dedupe-candidates — mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${REPORT ? ' + report' : ''}${MERGE ? ` + merge (${GROUPS_CERTAIN ? 'certain groups' : `approved: ${APPROVE_FILE}`})` : ''}`)
  if ((GROUPS_CERTAIN || APPROVE_FILE) && !APPLY) {
    console.log('Merge flags need --apply as well; nothing will be merged.')
  }

  let cands = await loadCandidates()
  await phaseA(cands)
  if (APPLY) cands = await loadCandidates()

  const groups = buildGroups(cands)
  summarize(groups)
  if (REPORT) writeReport(groups)

  if (!MERGE) return
  mkdirSync(REPORTS_DIR, { recursive: true })
  appendFileSync(MERGE_LOG, `\n=== Merge run ${new Date().toISOString()} ===\n`)

  let toMerge: Group[]
  if (GROUPS_CERTAIN) {
    toMerge = groups.filter((g) => g.type === 'CERTAIN')
  } else {
    const approved = readApprovedGroupIds(APPROVE_FILE!)
    toMerge = groups.filter((g) => approved.has(g.groupId))
    const found = new Set(toMerge.map((g) => g.groupId))
    for (const id of approved) if (!found.has(id)) log(`  ! approved group ${id} not found (membership changed or already merged) — skipped`)
  }

  log(`\n== Phase C — merging ${toMerge.length} group(s) ==`)
  let ok = 0, failed = 0
  for (const g of toMerge) {
    try { await mergeGroup(g); ok++ } catch (err) {
      failed++
      log(`  ✗ ${g.groupId} failed and was rolled back: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  log(`\nMerge finished: ${ok} merged, ${failed} failed. Log: ${path.relative(process.cwd(), MERGE_LOG)}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
