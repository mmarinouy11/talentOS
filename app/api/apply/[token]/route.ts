import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getMonthlyHoursBaseline, hourlyToMonthly } from '@/lib/dgm'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const position = await db.position.findFirst({
    where: { applicationToken: token, deletedAt: null, status: 'OPEN' },
    select: {
      id: true,
      title: true,
      client: true,
      description: true,
      location: true,
      internalCostBudget: true,
      screeningQuestions: true,
    },
  })

  if (!position) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  let budgetMonthly: number | null = null
  if (position.internalCostBudget != null) {
    const baseline = await getMonthlyHoursBaseline()
    budgetMonthly = hourlyToMonthly(position.internalCostBudget, baseline)
  }

  return NextResponse.json({
    id: position.id,
    title: position.title,
    client: position.client,
    description: position.description,
    location: position.location,
    budgetMonthly,
    screeningQuestions: position.screeningQuestions,
  })
}
