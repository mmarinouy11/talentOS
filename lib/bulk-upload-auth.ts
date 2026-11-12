import { NextResponse } from 'next/server'
import { auth } from './auth'

// Bulk CV upload is for RECRUITER and ADMIN users
export async function requireBulkUploader(): Promise<{ userId: string; role: string } | NextResponse> {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'RECRUITER' && user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return { userId: user.id, role: user.role }
}
