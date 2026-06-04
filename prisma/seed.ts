import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

async function main() {
  const adapter = new PrismaPg(process.env.DATABASE_URL!)
  const db = new PrismaClient({ adapter })

  const passwordHash = await bcrypt.hash('TalentOS2026!', 12)

  const user = await db.user.upsert({
    where: { email: 'marcelo.marino@infogain.com' },
    update: {},
    create: {
      email: 'marcelo.marino@infogain.com',
      name: 'Marcelo',
      passwordHash,
      role: 'ADMIN',
    },
  })

  console.log('Seeded admin user:', user.email, '— role:', user.role)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
