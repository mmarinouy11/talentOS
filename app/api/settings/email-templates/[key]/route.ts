import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key } = await params
  const { subject, htmlBody } = await request.json()
  if (!subject || !htmlBody) {
    return NextResponse.json({ error: 'subject and htmlBody are required' }, { status: 400 })
  }

  const userId = (session.user as { id?: string }).id

  const template = await db.systemEmailTemplate.upsert({
    where: { key },
    create: { key, name: key, subject, htmlBody, updatedById: userId },
    update: { subject, htmlBody, updatedById: userId },
  })
  return NextResponse.json(template)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key } = await params
  await db.systemEmailTemplate.deleteMany({ where: { key } })
  return NextResponse.json({ success: true })
}
