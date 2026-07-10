import { db } from '../lib/db'

const names = [
  ['Joel Daniel', 'Matos Diaz'],
  ['Matheus Batista', 'Teixeira'],
  ['Danilo', 'Kadota'],
  ['Francisco', 'M.'],
  ['Allan', 'Furlani'],
  ['Jonnathan Alejandro', 'Sanchez Alarcon'],
  ['Luis', 'Boscan'],
  ['William', 'Pinho'],
  ['Ivo', 'Moreira'],
  ['Charles', 'Luxinger'],
  ['Felipe', 'Zambrin'],
  ['Abraham', 'Rayas'],
  ['Alexandro', 'Andrade'],
  ['Carlos', 'Torres'],
  ['Luis', 'Chica'],
  ['Julio', 'S'],
  ['Juan Felipe', 'H'],
  ['Eduardo', 'Palomino'],
]

async function main() {
  let deleted = 0
  let notFound = 0
  for (const [firstName, lastName] of names) {
    const candidate = await db.candidate.findFirst({
      where: {
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      }
    })
    if (!candidate) {
      console.log('NOT FOUND:', firstName, lastName)
      notFound++
      continue
    }
    await db.$transaction(async (tx) => {
      await tx.candidatePosition.deleteMany({ where: { candidateId: candidate.id } })
      await tx.candidate.delete({ where: { id: candidate.id } })
    })
    console.log('DELETED:', firstName, lastName)
    deleted++
  }
  console.log('Done:', deleted, 'deleted,', notFound, 'not found')
}
main().catch(console.error).finally(() => process.exit(0))
