import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return { deny: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return { deny: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null }
  }
  return { deny: null, session }
}

export async function GET() {
  const { deny } = await requireAdmin()
  if (deny) return deny

  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(users)
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'RECRUITER', 'INTERVIEWER', 'HIRING_MANAGER']),
  password: z.string().min(6),
})

export async function POST(request: Request) {
  const { deny } = await requireAdmin()
  if (deny) return deny

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, email, role, password } = parsed.data

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await db.user.create({
    data: { name, email, role: role as Role, passwordHash, active: true },
    select: { id: true, name: true, email: true, role: true, active: true },
  })

  return NextResponse.json(user, { status: 201 })
}
