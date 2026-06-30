import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string }
  // Any authenticated user may read settings (e.g. for DGM threshold display in PositionForm)
  // Modifying settings remains ADMIN-only (see /api/settings/[key] PATCH)
  const settings = await db.systemSettings.findMany({ orderBy: { key: 'asc' } })
  return NextResponse.json(settings)
}
