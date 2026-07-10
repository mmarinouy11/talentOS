/**
 * Historical import: Forward Deployed Engineer / Intuit
 * Run from project root:
 * DATABASE_URL="postgresql://postgres:yoFqytyDkqJBWrLieZLXmwWrloJFUjSD@acela.proxy.rlwy.net:25752/railway" npx tsx scripts/import_fde_candidates.ts
 */

import { db } from '../lib/db'
import { Stage, SourceType } from '@prisma/client'

const POSITION_ID = 'cmqk2zptl0000tpsdphfgqvyq'

const USERS = {
  cristian: 'cmqs6eaav00019psdv65lykhc',
  ximena:   'cmqs6diq700009psdlkt052yt',
  jai:      'cmqzfsyjc00010pn1lgtqfla1',
}

const VENDORS = {
  zircon:    'cmqmnk8ic0000unsdj1aq7qx4',
  integrass: 'cmqs5mimk00020plfhbyl9ub0',
  venon:     'cmqs5knuu00000plfv2a7i9bz',
}

interface CandidateRow {
  firstName: string
  lastName: string
  country: string
  sourceType: SourceType
  sourceUserId?: string
  sourceVendorId?: string
  recruiterId: string
  stage: Stage
  notes?: string
}

function makeEmail(firstName: string, lastName: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.')
  return `${clean(firstName)}.${clean(lastName)}@import.tenarai.com`
}

const candidates: CandidateRow[] = [
  { firstName: 'Carlos Eduardo', lastName: 'Gardenal', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Leon', lastName: 'Osty', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Micael', lastName: 'Santana', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING, notes: 'Candidate no show — dropped' },
  { firstName: 'Pedro Shaina', lastName: 'Martins', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Candidate drop' },
  { firstName: 'Christian', lastName: 'Aguilar', country: 'Peru', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING },
  { firstName: 'Paulo Ricardo', lastName: "Sant'ana", country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Manuel Efren', lastName: 'Villacriz Cordoba', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Eduardo', lastName: 'Flores', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Carlos Andres', lastName: 'Fernandez', country: 'Ecuador', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.CLIENT_INTERVIEW, notes: 'Submitted to client' },
  { firstName: 'Jose', lastName: 'Lozano', country: 'Argentina', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Waiting to reschedule' },
  { firstName: 'Juan', lastName: 'A', country: 'Mexico', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.integrass, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Francisco', lastName: 'V', country: 'Chile', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.integrass, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Candidate drop' },
  { firstName: 'Jose', lastName: 'Benavides', country: 'Ecuador', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.OFFER, notes: 'Onboarding confirmation awaited' },
  { firstName: 'Julian', lastName: 'Pena', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Passed JT — select for pipeline' },
  { firstName: 'Osman', lastName: 'Albarran', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Tales', lastName: 'Heredia', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Daniel', lastName: 'Sanchez', country: 'Dominican Republic', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Joel Daniel', lastName: 'Matos Diaz', country: 'Mexico', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING },
  { firstName: 'Brendo', lastName: 'Sousa', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Galo Javier', lastName: 'Pule Revelo', country: 'Ecuador', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.CLIENT_INTERVIEW, notes: 'Submitted to client' },
  { firstName: 'Matheus Batista', lastName: 'Teixeira', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Danilo', lastName: 'Kadota', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Francisco', lastName: 'M.', country: 'Argentina', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Allan', lastName: 'Furlani', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Jonnathan Alejandro', lastName: 'Sanchez Alarcon', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Luis', lastName: 'Boscan', country: 'Chile', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Gabriel', lastName: 'Azevedo', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING, notes: 'Candidate drop' },
  { firstName: 'Renan', lastName: 'Sued', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Ivan', lastName: 'Cavalcante', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Daniel', lastName: 'Gonzalez', country: 'Mexico', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'William', lastName: 'Pinho', country: 'Mexico', sourceType: SourceType.RECRUITER, sourceUserId: USERS.jai, recruiterId: USERS.jai, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Ivo', lastName: 'Moreira', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.jai, recruiterId: USERS.jai, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Charles', lastName: 'Luxinger', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.jai, recruiterId: USERS.jai, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Felipe', lastName: 'Zambrin', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.jai, recruiterId: USERS.jai, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Leonardo Arnaldo', lastName: 'Medina', country: 'Argentina', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.integrass, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Manuel', lastName: 'Grot', country: 'Colombia', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Marcelo', lastName: 'Hidalgo', country: 'Ecuador', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Passed JT — L2 interview scheduled' },
  { firstName: 'Wil', lastName: 'Ripoll', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Passed JT — L2 interview scheduled' },
  { firstName: 'Abraham', lastName: 'Rayas', country: 'Mexico', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING },
  { firstName: 'Jose Ricardo', lastName: 'Sandoval Zeballos', country: 'Bolivia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Alexandro', lastName: 'Andrade', country: 'Mexico', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.REJECTED },
  { firstName: 'Jeffrey', lastName: 'Santana', country: 'Dominican Republic', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Anthony', lastName: 'Rojas', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Esteban', lastName: 'Rendon', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Guillermo', lastName: 'Rojas', country: 'Mexico', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Carlos', lastName: 'Torres', country: 'Mexico', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.integrass, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Passed JT — select for pipeline' },
  { firstName: 'Leandro', lastName: 'Castilho', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING },
  { firstName: 'Andres', lastName: 'Perez', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Ewdin', lastName: 'Z', country: 'Ecuador', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Josimar', lastName: 'Sanchez', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
  { firstName: 'Luis', lastName: 'Chica', country: 'Ecuador', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
  { firstName: 'Juan Felipe', lastName: 'H', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING },
  { firstName: 'Cesar', lastName: 'Ocampo', country: 'Mexico', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Passed JT — select for pipeline' },
  { firstName: 'Manuel', lastName: 'Gorut', country: '', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Benjamin', lastName: 'Gomez Forero', country: 'Colombia', sourceType: SourceType.RECRUITER, sourceUserId: USERS.jai, recruiterId: USERS.jai, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview to be scheduled' },
  { firstName: 'Cleber', lastName: 'da Silva', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.jai, recruiterId: USERS.jai, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview scheduled July 1' },
  { firstName: 'Iva', lastName: 'Martins', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
  { firstName: 'Fernando', lastName: 'Gomes', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
  { firstName: 'Juan Carlos', lastName: 'Espinosa', country: 'Mexico', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
  { firstName: 'Jorge', lastName: 'Lopes', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING },
  { firstName: 'Victor', lastName: 'O', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.cristian, recruiterId: USERS.cristian, stage: Stage.SCREENING },
  { firstName: 'Giovanni', lastName: 'G', country: 'Mexico', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.integrass, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Edwin', lastName: 'Zamora', country: 'Ecuador', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview scheduled July 8' },
  { firstName: 'Tais', lastName: 'Contreras', country: 'Dominican Republic', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.venon, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Gualberto', lastName: 'Gomez', country: '', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.REJECTED },
  { firstName: 'Samuel', lastName: 'Sosa', country: 'Chile', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview scheduled July 7' },
  { firstName: 'Octavio', lastName: 'Alvarez del Castillo', country: 'Mexico', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'JT interview scheduled July 8' },
  { firstName: 'Gustavo', lastName: 'Figueiredo', country: 'Brazil', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Passed JT — approved for next round' },
  { firstName: 'Harry', lastName: 'Hernandez', country: 'Mexico', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Passed JT — approved for next round' },
  { firstName: 'Eduardo', lastName: 'Suarez', country: 'Mexico', sourceType: SourceType.VENDOR, sourceVendorId: VENDORS.zircon, recruiterId: USERS.cristian, stage: Stage.TECHNICAL_INTERVIEW, notes: 'Passed JT — approved for next round' },
  { firstName: 'Alexandre', lastName: 'Rolim', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
  { firstName: 'Rolando', lastName: 'Rodriguez', country: 'Mexico', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
  { firstName: 'Pablo', lastName: 'Lunardi', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
  { firstName: 'Murilo', lastName: 'Perrone', country: 'Brazil', sourceType: SourceType.RECRUITER, sourceUserId: USERS.ximena, recruiterId: USERS.ximena, stage: Stage.SCREENING },
]

async function main() {
  console.log(`Starting import of ${candidates.length} candidates...`)
  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const c of candidates) {
    const fullName = `${c.firstName} ${c.lastName}`.trim()
    try {
      const existingByName = await db.candidate.findFirst({
        where: {
          firstName: { equals: c.firstName, mode: 'insensitive' },
          lastName: { equals: c.lastName, mode: 'insensitive' },
          candidatePositions: { some: { positionId: POSITION_ID } }
        }
      })

      if (existingByName) {
        console.log(`  SKIP (already exists): ${fullName}`)
        skipped++
        continue
      }

      const email = makeEmail(c.firstName, c.lastName)

      // If email already taken (another candidate), make it unique
      const existingEmail = await db.candidate.findUnique({ where: { email } })
      const finalEmail = existingEmail
        ? email.replace('@', `${Date.now()}@`)
        : email

      await db.$transaction(async (tx) => {
        const candidate = await tx.candidate.create({
          data: {
            firstName: c.firstName,
            lastName: c.lastName,
            email: finalEmail,
            country: c.country || null,
            recruiterId: c.recruiterId,
            sourcedByType: c.sourceType,
            sourcedByUserId: c.sourceUserId ?? null,
            sourcedByVendorId: c.sourceVendorId ?? null,
          }
        })

        await tx.candidatePosition.create({
          data: {
            candidateId: candidate.id,
            positionId: POSITION_ID,
            recruiterId: c.recruiterId,
            stage: c.stage,
            notes: c.notes ?? null,
          }
        })
      })

      console.log(`  OK: ${fullName} → ${c.stage}`)
      created++
    } catch (err: any) {
      const msg = `ERROR: ${fullName}: ${err.message}`
      console.error(`  ${msg}`)
      errors.push(msg)
    }
  }

  console.log(`\n✅ Done: ${created} created, ${skipped} skipped, ${errors.length} errors`)
  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.forEach(e => console.log(`  - ${e}`))
  }
}

main().catch(console.error).finally(() => process.exit(0))
