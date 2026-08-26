import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendPipelineReportEmail } from '@/lib/pipeline-report-cron'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await sendPipelineReportEmail()
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 })
  return NextResponse.json({ sent: result.sent })
}
