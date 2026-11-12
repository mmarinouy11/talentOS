import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { decideRedeploymentProfile } from '@/lib/redeployment-sync'

const schema = z.object({ decision: z.enum(['same', 'different']) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'ADMIN' && user.role !== 'RECRUITER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  const { id } = await params
  try {
    await decideRedeploymentProfile(id, parsed.data.decision, user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save the decision'
    console.error(`[redeployment] Decision failed for profile ${id}:`, message)
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
