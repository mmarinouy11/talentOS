import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

async function main() {
  const adapter = new PrismaPg(process.env.DATABASE_URL!)
  const db = new PrismaClient({ adapter })

  const passwordHash = await bcrypt.hash('Talent#9271!xQ', 12)

  const user = await db.user.upsert({
    where: { email: 'marcelo.marino@infogain.com' },
    update: { name: 'Marcelo Marino', passwordHash },
    create: {
      email: 'marcelo.marino@infogain.com',
      name: 'Marcelo Marino',
      passwordHash,
      role: 'ADMIN',
    },
  })

  await db.systemSettings.upsert({
    where: { key: 'MIN_DGM_PERCENT' },
    update: {},
    create: {
      key: 'MIN_DGM_PERCENT',
      value: '40',
      description: 'Minimum acceptable Delivery Gross Margin percentage. Positions below this are flagged at risk.',
    },
  })

  await db.systemSettings.upsert({
    where: { key: 'MONTHLY_HOURS_BASELINE' },
    update: {},
    create: {
      key: 'MONTHLY_HOURS_BASELINE',
      value: '168',
      description: 'Hours per month used to convert between hourly position rates and monthly candidate compensation.',
    },
  })

  await db.systemSettings.upsert({
    where: { key: 'SENDER_EMAIL' },
    update: {},
    create: {
      key: 'SENDER_EMAIL',
      value: 'noreply@example.com',
      description: 'From address used when sending emails to candidates (must be verified in Resend).',
    },
  })

  await db.systemSettings.upsert({
    where: { key: 'DEFAULT_DURATION_SCREENING_MANAGER' },
    update: {},
    create: {
      key: 'DEFAULT_DURATION_SCREENING_MANAGER',
      value: '30',
      description: 'Default interview duration (minutes) for Screening and Manager Interview rounds.',
    },
  })

  await db.systemSettings.upsert({
    where: { key: 'DEFAULT_DURATION_OTHER' },
    update: {},
    create: {
      key: 'DEFAULT_DURATION_OTHER',
      value: '60',
      description: 'Default interview duration (minutes) for Technical and Client Interview rounds.',
    },
  })

  await db.systemSettings.upsert({
    where: { key: 'VENDOR_MIN_FIT_SCORE' },
    update: {},
    create: {
      key: 'VENDOR_MIN_FIT_SCORE',
      value: '70',
      description: 'Minimum fit score (0–100) for vendor-submitted candidates. Submissions below this threshold are automatically rejected.',
    },
  })

  await db.systemSettings.upsert({
    where: { key: 'DIRECT_MIN_FIT_SCORE' },
    update: {},
    create: {
      key: 'DIRECT_MIN_FIT_SCORE',
      value: '30',
      description: 'Minimum fit score (0–100) for direct (portal) applications. Applications below this threshold are automatically rejected.',
    },
  })

  console.log('Seeded admin user:', user.email, '— role:', user.role)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
