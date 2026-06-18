import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { parseJD } from '@/lib/jd-parser'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const result = await parseJD(id)
  if (!result) return NextResponse.json({ error: 'Position not found or parse failed' }, { status: 404 })
  return NextResponse.json(result)
}
