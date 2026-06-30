import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { runReportingCron } from '@/lib/reporting-cron'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await runReportingCron()
  return NextResponse.json({ ok: true })
}
