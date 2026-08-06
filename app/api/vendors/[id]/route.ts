import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  pocName: z.string().optional().nullable(),
  pocEmail: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
  type: z.enum(['RECRUITING_PARTNER', 'REFERRAL_NETWORK']).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let vendor = await db.vendor.findUnique({ where: { id } })
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Backfill missing portalToken for legacy vendor
  if (!vendor.portalToken) {
    vendor = await db.vendor.update({ where: { id }, data: { portalToken: randomBytes(32).toString('hex') } })
  }

  return NextResponse.json(vendor)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await db.vendor.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Auto-generate referralToken when switching to REFERRAL_NETWORK type
  let extraData: { referralToken?: string } = {}
  if (parsed.data.type === 'REFERRAL_NETWORK' && !existing.referralToken) {
    extraData.referralToken = randomBytes(32).toString('hex')
  }
  const vendor = await db.vendor.update({ where: { id }, data: { ...parsed.data, ...extraData } })
  return NextResponse.json(vendor)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await db.vendor.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Soft delete via active = false
  const vendor = await db.vendor.update({ where: { id }, data: { active: false } })
  return NextResponse.json(vendor)
}
