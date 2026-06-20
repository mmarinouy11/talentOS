import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const vendorSchema = z.object({
  name: z.string().min(1),
  pocName: z.string().optional().nullable(),
  pocEmail: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().default(true),
})

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('active') === 'true'

  const vendors = await db.vendor.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(vendors)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = vendorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const vendor = await db.vendor.create({ data: parsed.data })
  return NextResponse.json(vendor, { status: 201 })
}
