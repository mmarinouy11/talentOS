import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { getTimeToStage, getTimeInStage, getLeadTime } from '@/lib/analytics'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const positionId = searchParams.get('positionId') ?? undefined

  const [timeToStage, timeInStage, leadTime] = await Promise.all([
    getTimeToStage(positionId),
    getTimeInStage(positionId),
    getLeadTime(positionId),
  ])

  return NextResponse.json({ timeToStage, timeInStage, leadTime })
}
