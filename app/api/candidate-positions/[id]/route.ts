import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const cp = await db.candidatePosition.findFirst({ where: { id } })
  if (!cp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(cp)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.candidatePosition.findFirst({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.$transaction([
    db.emailLog.deleteMany({ where: { interview: { candidatePositionId: id } } }),
    db.emailLog.deleteMany({ where: { candidatePositionId: id } }),
    db.interview.deleteMany({ where: { candidatePositionId: id } }),
    db.stageHistory.deleteMany({ where: { candidatePositionId: id } }),
    db.candidatePosition.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}
