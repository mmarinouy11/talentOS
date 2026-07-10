/**
 * Import historical Tech Interview rounds for FDE / Intuit candidates
 * Run from project root:
 * DATABASE_URL="postgresql://postgres:yoFqytyDkqJBWrLieZLXmwWrloJFUjSD@acela.proxy.rlwy.net:25752/railway" npx tsx scripts/import_fde_rounds.ts
 */

import { db } from '../lib/db'
import { Stage, InterviewStatus, InterviewDecision } from '@prisma/client'

const POSITION_ID = 'cmqk2zptl0000tpsdphfgqvyq'

function mapDecision(result: string): InterviewDecision | null {
  if (['Select', 'Approved'].includes(result)) return InterviewDecision.ADVANCE
  if (['Rejected', 'Drop'].includes(result)) return InterviewDecision.REJECT
  return null
}

function mapStatus(result: string): InterviewStatus {
  if (result === 'Scheduled') return InterviewStatus.SCHEDULED
  return InterviewStatus.COMPLETED
}

const rounds = [
  { firstName: 'Eduardo',            lastName: 'Flores',                date: '2026-06-23', result: 'Rejected' },
  { firstName: 'Carlos Andres',      lastName: 'Fernandez',             date: '2026-06-26', result: 'Select' },
  { firstName: 'Francisco',          lastName: 'V',                     date: '2026-06-26', result: 'Drop' },
  { firstName: 'Jose',               lastName: 'Benavides',             date: '2026-06-08', result: 'Select' },
  { firstName: 'Julian',             lastName: 'Pena',                  date: '2026-04-17', result: 'Select' },
  { firstName: 'Osman',              lastName: 'Albarran',              date: '2026-06-25', result: 'Rejected' },
  { firstName: 'Tales',              lastName: 'Heredia',               date: '2026-06-24', result: 'Rejected' },
  { firstName: 'Daniel',             lastName: 'Sanchez',               date: '2026-06-26', result: 'Rejected' },
  { firstName: 'Renan',              lastName: 'Sued',                  date: '2026-06-26', result: 'Rejected' },
  { firstName: 'Daniel',             lastName: 'Gonzalez',              date: '2026-06-30', result: 'Rejected' },
  { firstName: 'Manuel',             lastName: 'Grot',                  date: '2026-06-25', result: 'Rejected' },
  { firstName: 'Marcelo',            lastName: 'Hidalgo',               date: '2026-06-26', result: 'Select' },
  { firstName: 'Wil',                lastName: 'Ripoll',                date: '2026-06-29', result: 'Select' },
  { firstName: 'Jose Ricardo',       lastName: 'Sandoval Zeballos',     date: '2026-06-30', result: 'Rejected' },
  { firstName: 'Jeffrey',            lastName: 'Santana',               date: '2026-06-30', result: 'Rejected' },
  { firstName: 'Anthony',            lastName: 'Rojas',                 date: '2026-06-30', result: 'Rejected' },
  { firstName: 'Esteban',            lastName: 'Rendon',                date: '2026-06-29', result: 'Rejected' },
  { firstName: 'Cesar',              lastName: 'Ocampo',                date: '2026-06-29', result: 'Select' },
  { firstName: 'Manuel',             lastName: 'Gorut',                 date: '2026-06-29', result: 'Rejected' },
  { firstName: 'Giovanni',           lastName: 'G',                     date: '2026-07-01', result: 'Rejected' },
  { firstName: 'Tais',               lastName: 'Contreras',             date: '2026-07-03', result: 'Rejected' },
  { firstName: 'Gualberto',          lastName: 'Gomez',                 date: '2026-07-02', result: 'Rejected' },
  { firstName: 'Samuel',             lastName: 'Sosa',                  date: '2026-07-07', result: 'Scheduled' },
  { firstName: 'Octavio',            lastName: 'Alvarez del Castillo',  date: '2026-07-08', result: 'Scheduled' },
  { firstName: 'Gustavo',            lastName: 'Figueiredo',            date: '2026-07-06', result: 'Approved' },
  { firstName: 'Harry',              lastName: 'Hernandez',             date: '2026-07-03', result: 'Approved' },
  { firstName: 'Eduardo',            lastName: 'Suarez',                date: '2026-07-02', result: 'Approved' },
  { firstName: 'Andres',             lastName: 'Perez',                 date: '2026-06-30', result: 'Rejected' },
]

async function main() {
  console.log(`Creating ${rounds.length} interview rounds...`)
  let created = 0
  let notFound = 0
  let skipped = 0
  const errors: string[] = []

  for (const r of rounds) {
    const fullName = `${r.firstName} ${r.lastName}`
    try {
      const cp = await db.candidatePosition.findFirst({
        where: {
          positionId: POSITION_ID,
          candidate: {
            firstName: { equals: r.firstName, mode: 'insensitive' },
            lastName: { equals: r.lastName, mode: 'insensitive' },
          }
        }
      })

      if (!cp) {
        console.log(`  NOT FOUND: ${fullName}`)
        notFound++
        continue
      }

      const existing = await db.interview.findFirst({
        where: {
          candidatePositionId: cp.id,
          stage: Stage.TECHNICAL_INTERVIEW,
        }
      })

      if (existing) {
        console.log(`  SKIP (round already exists): ${fullName}`)
        skipped++
        continue
      }

      const decision = mapDecision(r.result)
      const status = mapStatus(r.result)
      const scheduledAt = new Date(`${r.date}T10:00:00Z`)

      await db.interview.create({
        data: {
          candidatePositionId: cp.id,
          stage: Stage.TECHNICAL_INTERVIEW,
          status,
          scheduledAt,
          decision: decision ?? undefined,
          isInternal: false,
          roundLabel: 'Technical Interview (JT)',
          roundNumber: 1,
          feedbackSummary: `JT result: ${r.result}`,
        }
      })

      console.log(`  OK: ${fullName} | ${r.date} | ${r.result} → ${status}${decision ? ' / ' + decision : ''}`)
      created++
    } catch (err: any) {
      const msg = `ERROR: ${fullName}: ${err.message}`
      console.error(`  ${msg}`)
      errors.push(msg)
    }
  }

  console.log(`\n✅ Done: ${created} created, ${skipped} skipped, ${notFound} not found, ${errors.length} errors`)
  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.forEach(e => console.log(`  - ${e}`))
  }
}

main().catch(console.error).finally(() => process.exit(0))
