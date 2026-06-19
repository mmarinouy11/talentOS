import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { getFunnelData } from '@/lib/analytics'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const positionId = searchParams.get('positionId') ?? undefined

  const data = await getFunnelData(positionId)
  return NextResponse.json(data)
}
