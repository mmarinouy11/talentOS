import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const exists = await db.candidatePosition.findFirst({ where: { id } })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await scoreCandidateForPosition(id)

  const updated = await db.candidatePosition.findFirst({ where: { id } })
  return NextResponse.json(updated)
}
