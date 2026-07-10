/**
 * Import ALL historical rounds for FDE / Intuit candidates
 * Creates: Screening round + Tech Interview round + Manager Interview round (where applicable)
 * Run from project root:
 * DATABASE_URL="postgresql://postgres:yoFqytyDkqJBWrLieZLXmwWrloJFUjSD@acela.proxy.rlwy.net:25752/railway" npx tsx scripts/import_fde_all_rounds.ts
 */

import { db } from '../lib/db'
import { Stage, InterviewStatus, InterviewDecision } from '@prisma/client'

const POSITION_ID = 'cmqk2zptl0000tpsdphfgqvyq'

function mapScreenDecision(tag: string | null): InterviewDecision | null {
  if (!tag) return null
  const t = tag.toLowerCase()
  if (t.includes('reject') || t.includes('no show')) return InterviewDecision.REJECT
  if (t.includes('select') || t.includes('pipeline')) return InterviewDecision.ADVANCE
  return null
}

function mapJtDecision(result: string | null): InterviewDecision | null {
  if (!result) return null
  if (['Select', 'Approved'].includes(result)) return InterviewDecision.ADVANCE
  if (['Rejected', 'Drop'].includes(result)) return InterviewDecision.REJECT
  return null
}

function mapJtStatus(result: string | null): InterviewStatus {
  if (!result || result === 'TBS' || result === 'Waiting') return InterviewStatus.PENDING
  if (result === 'Scheduled') return InterviewStatus.SCHEDULED
  return InterviewStatus.COMPLETED
}

interface CandidateRounds {
  firstName: string
  lastName: string
  screenDate: string | null
  screenTag: string | null
  techDate: string | null
  jtResult: string | null
  hasL2: boolean
}

const candidates: CandidateRounds[] = [
  { firstName: 'Carlos Eduardo', lastName: 'Gardenal',              screenDate: '2026-06-16', screenTag: 'Rejected',      techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Leon',           lastName: 'Osty',                  screenDate: '2026-06-16', screenTag: 'Rejected',      techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Micael',         lastName: 'Santana',               screenDate: '2026-06-16', screenTag: 'no show',       techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Pedro Shaina',   lastName: 'Martins',               screenDate: '2026-06-18', screenTag: 'Select Screen', techDate: '2026-06-19', jtResult: 'Drop',      hasL2: false },
  { firstName: 'Christian',      lastName: 'Aguilar',               screenDate: null,         screenTag: 'TBS',           techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Paulo Ricardo',  lastName: "Sant'ana",              screenDate: '2026-06-22', screenTag: 'Rejected',      techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Manuel Efren',   lastName: 'Villacriz Cordoba',     screenDate: '2026-06-18', screenTag: 'Rejected',      techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Eduardo',        lastName: 'Flores',                screenDate: '2026-06-18', screenTag: 'Screen Select', techDate: '2026-06-23', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Carlos Andres',  lastName: 'Fernandez',             screenDate: '2026-06-18', screenTag: 'Screen Select', techDate: '2026-06-26', jtResult: 'Select',    hasL2: true  },
  { firstName: 'Jose',           lastName: 'Lozano',                screenDate: '2026-06-22', screenTag: 'Screen Select', techDate: null,         jtResult: 'Waiting',   hasL2: false },
  { firstName: 'Juan',           lastName: 'A',                     screenDate: '2026-06-12', screenTag: 'Screen Select', techDate: '2026-06-22', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Francisco',      lastName: 'V',                     screenDate: '2024-06-08', screenTag: 'Screen Select', techDate: '2026-06-26', jtResult: 'Drop',      hasL2: false },
  { firstName: 'Jose',           lastName: 'Benavides',             screenDate: '2026-06-11', screenTag: 'Screen Select', techDate: '2026-06-08', jtResult: 'Select',    hasL2: true  },
  { firstName: 'Julian',         lastName: 'Pena',                  screenDate: '2026-04-22', screenTag: 'Screen Select', techDate: '2026-04-17', jtResult: 'Select',    hasL2: true  },
  { firstName: 'Osman',          lastName: 'Albarran',              screenDate: '2026-06-18', screenTag: 'Screen Select', techDate: '2026-06-25', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Tales',          lastName: 'Heredia',               screenDate: '2026-06-19', screenTag: 'Screen Select', techDate: '2026-06-24', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Daniel',         lastName: 'Sanchez',               screenDate: '2026-06-24', screenTag: 'Screen Select', techDate: '2026-06-26', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Brendo',         lastName: 'Sousa',                 screenDate: '2026-06-05', screenTag: 'Rejected',      techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Galo Javier',    lastName: 'Pule Revelo',           screenDate: '2026-06-19', screenTag: 'Screen Select', techDate: '2026-06-26', jtResult: 'Select',    hasL2: true  },
  { firstName: 'Gabriel',        lastName: 'Azevedo',               screenDate: '2026-06-22', screenTag: 'Screen Select', techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Renan',          lastName: 'Sued',                  screenDate: '2026-06-19', screenTag: 'Select Screen', techDate: '2026-06-26', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Ivan',           lastName: 'Cavalcante',            screenDate: '2026-06-23', screenTag: 'Rejected',      techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Daniel',         lastName: 'Gonzalez',              screenDate: '2026-06-18', screenTag: 'Select Screen', techDate: '2026-06-30', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Leonardo Arnaldo',lastName: 'Medina',               screenDate: '2026-06-19', screenTag: 'Select Screen', techDate: null,         jtResult: 'TBS',       hasL2: false },
  { firstName: 'Manuel',         lastName: 'Grot',                  screenDate: '2026-06-22', screenTag: 'Select Screen', techDate: '2026-06-25', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Marcelo',        lastName: 'Hidalgo',               screenDate: '2026-06-24', screenTag: 'Select Screen', techDate: '2026-06-26', jtResult: 'Select',    hasL2: true  },
  { firstName: 'Wil',            lastName: 'Ripoll',                screenDate: '2026-06-25', screenTag: 'Select Screen', techDate: '2026-06-29', jtResult: 'Select',    hasL2: true  },
  { firstName: 'Jose Ricardo',   lastName: 'Sandoval Zeballos',     screenDate: '2026-06-24', screenTag: 'Select Screen', techDate: '2026-06-30', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Jeffrey',        lastName: 'Santana',               screenDate: '2026-06-24', screenTag: 'Select Screen', techDate: '2026-06-30', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Anthony',        lastName: 'Rojas',                 screenDate: '2026-06-24', screenTag: 'Select Screen', techDate: '2026-06-30', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Esteban',        lastName: 'Rendon',                screenDate: '2026-06-25', screenTag: 'Select Screen', techDate: '2026-06-29', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Guillermo',      lastName: 'Rojas',                 screenDate: '2026-06-23', screenTag: 'Select Screen', techDate: null,         jtResult: 'TBS',       hasL2: false },
  { firstName: 'Leandro',        lastName: 'Castilho',              screenDate: '2026-06-26', screenTag: null,            techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Andres',         lastName: 'Perez',                 screenDate: '2026-06-25', screenTag: 'Select Screen', techDate: '2026-06-30', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Ewdin',          lastName: 'Z',                     screenDate: '2026-06-25', screenTag: 'Select Screen', techDate: null,         jtResult: 'TBS',       hasL2: false },
  { firstName: 'Josimar',        lastName: 'Sanchez',               screenDate: '2026-06-30', screenTag: null,            techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Alexandro',      lastName: 'Andrade',               screenDate: '2026-06-25', screenTag: 'Select Screen', techDate: '2026-06-26', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Cesar',          lastName: 'Ocampo',                screenDate: '2026-06-24', screenTag: 'Select Screen', techDate: '2026-06-29', jtResult: 'Select',    hasL2: false },
  { firstName: 'Manuel',         lastName: 'Gorut',                 screenDate: '2026-06-22', screenTag: 'Select Screen', techDate: '2026-06-29', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Iva',            lastName: 'Martins',               screenDate: '2026-06-30', screenTag: null,            techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Fernando',       lastName: 'Gomes',                 screenDate: null,         screenTag: 'In pipeline',   techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Juan Carlos',    lastName: 'Espinosa',              screenDate: null,         screenTag: 'In pipeline',   techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Jorge',          lastName: 'Lopes',                 screenDate: null,         screenTag: 'In pipeline',   techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Victor',         lastName: 'O',                     screenDate: null,         screenTag: 'In pipeline',   techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Giovanni',       lastName: 'G',                     screenDate: '2026-06-29', screenTag: 'Select screen', techDate: '2026-07-01', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Tais',           lastName: 'Contreras',             screenDate: '2026-06-26', screenTag: 'Select screen', techDate: '2026-07-03', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Gualberto',      lastName: 'Gomez',                 screenDate: '2026-06-30', screenTag: 'Select screen', techDate: '2026-07-02', jtResult: 'Rejected',  hasL2: false },
  { firstName: 'Samuel',         lastName: 'Sosa',                  screenDate: '2026-07-03', screenTag: 'Select screen', techDate: '2026-07-07', jtResult: 'Scheduled', hasL2: false },
  { firstName: 'Octavio',        lastName: 'Alvarez del Castillo',  screenDate: '2026-07-02', screenTag: 'Select screen', techDate: '2026-07-08', jtResult: 'Scheduled', hasL2: false },
  { firstName: 'Gustavo',        lastName: 'Figueiredo',            screenDate: '2026-07-02', screenTag: 'Select screen', techDate: '2026-07-06', jtResult: 'Approved',  hasL2: false },
  { firstName: 'Harry',          lastName: 'Hernandez',             screenDate: '2026-07-01', screenTag: 'Select screen', techDate: '2026-07-03', jtResult: 'Approved',  hasL2: false },
  { firstName: 'Eduardo',        lastName: 'Suarez',                screenDate: '2026-06-30', screenTag: 'Select screen', techDate: '2026-07-02', jtResult: 'Approved',  hasL2: false },
  { firstName: 'Alexandre',      lastName: 'Rolim',                 screenDate: '2026-07-08', screenTag: 'In pipeline',   techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Rolando',        lastName: 'Rodriguez',             screenDate: '2026-07-08', screenTag: 'In pipeline',   techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Pablo',          lastName: 'Lunardi',               screenDate: null,         screenTag: 'In pipeline',   techDate: null,         jtResult: null,        hasL2: false },
  { firstName: 'Murilo',         lastName: 'Perrone',               screenDate: null,         screenTag: 'In pipeline',   techDate: null,         jtResult: null,        hasL2: false },
]

async function main() {
  console.log(`Processing ${candidates.length} candidates...`)
  let screenCreated = 0, techCreated = 0, l2Created = 0
  let skipped = 0, notFound = 0
  const errors: string[] = []

  for (const c of candidates) {
    const fullName = `${c.firstName} ${c.lastName}`
    try {
      const cp = await db.candidatePosition.findFirst({
        where: {
          positionId: POSITION_ID,
          candidate: {
            firstName: { equals: c.firstName, mode: 'insensitive' },
            lastName: { equals: c.lastName, mode: 'insensitive' },
          }
        }
      })

      if (!cp) {
        console.log(`  NOT FOUND: ${fullName}`)
        notFound++
        continue
      }

      const existingRounds = await db.interview.findMany({
        where: { candidatePositionId: cp.id },
        select: { stage: true }
      })
      const existingStages = new Set(existingRounds.map(r => r.stage))

      // ── Screening round ──────────────────────────────────────────────────
      if (!existingStages.has(Stage.SCREENING)) {
        const screenDecision = mapScreenDecision(c.screenTag)
        const screenStatus = c.screenDate
          ? (screenDecision !== null ? InterviewStatus.COMPLETED : InterviewStatus.SCHEDULED)
          : InterviewStatus.PENDING

        await db.interview.create({
          data: {
            candidatePositionId: cp.id,
            stage: Stage.SCREENING,
            status: screenStatus,
            scheduledAt: c.screenDate ? new Date(`${c.screenDate}T10:00:00Z`) : undefined,
            decision: screenDecision ?? undefined,
            isInternal: true,
            roundLabel: 'Screening',
            roundNumber: 1,
            feedbackSummary: c.screenTag ? `Screening result: ${c.screenTag}` : undefined,
          }
        })
        screenCreated++
      } else {
        skipped++
      }

      // ── Tech Interview round (JT) ─────────────────────────────────────────
      if (c.techDate && !existingStages.has(Stage.TECHNICAL_INTERVIEW)) {
        const jtDecision = mapJtDecision(c.jtResult)
        const jtStatus = mapJtStatus(c.jtResult)

        await db.interview.create({
          data: {
            candidatePositionId: cp.id,
            stage: Stage.TECHNICAL_INTERVIEW,
            status: jtStatus,
            scheduledAt: new Date(`${c.techDate}T10:00:00Z`),
            decision: jtDecision ?? undefined,
            isInternal: false,
            roundLabel: 'Technical Interview (JT)',
            roundNumber: 2,
            feedbackSummary: c.jtResult ? `JT result: ${c.jtResult}` : undefined,
          }
        })
        techCreated++
      } else if (c.techDate) {
        skipped++
      }

      // ── Manager/L2 round ─────────────────────────────────────────────────
      if (c.hasL2 && !existingStages.has(Stage.MANAGER_INTERVIEW)) {
        await db.interview.create({
          data: {
            candidatePositionId: cp.id,
            stage: Stage.MANAGER_INTERVIEW,
            status: InterviewStatus.AWAITING_SCHEDULE,
            isInternal: true,
            roundLabel: 'Manager Interview (L2)',
            roundNumber: 3,
            feedbackSummary: 'L2 interview scheduled — pending confirmation',
          }
        })
        l2Created++
      }

      console.log(`  OK: ${fullName} | screen=${c.screenDate || '-'} | tech=${c.techDate || '-'} | L2=${c.hasL2}`)
    } catch (err: any) {
      const msg = `ERROR: ${fullName}: ${err.message}`
      console.error(`  ${msg}`)
      errors.push(msg)
    }
  }

  console.log(`\n✅ Done:`)
  console.log(`   Screening rounds created: ${screenCreated}`)
  console.log(`   Tech rounds created: ${techCreated}`)
  console.log(`   Manager (L2) rounds created: ${l2Created}`)
  console.log(`   Skipped (already existed): ${skipped}`)
  console.log(`   Not found: ${notFound}`)
  console.log(`   Errors: ${errors.length}`)
  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.forEach(e => console.log(`  - ${e}`))
  }
}

main().catch(console.error).finally(() => process.exit(0))
