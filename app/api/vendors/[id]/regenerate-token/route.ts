import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await db.vendor.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const portalToken = randomBytes(32).toString('hex')
  const vendor = await db.vendor.update({ where: { id }, data: { portalToken } })
  return NextResponse.json({ portalToken: vendor.portalToken })
}
