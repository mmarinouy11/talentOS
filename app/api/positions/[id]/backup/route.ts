import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'

const schema = z.object({
  title: z.string().trim().min(1),
  recruiterId: z.string().min(1),
})

// POST /api/positions/[id]/backup — clone a requisition into a new PROACTIVE position
// to source backup profiles. Reuses the existing JD intelligence (no re-parse).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Title and lead recruiter are required' }, { status: 400 })

  const source = await db.position.findFirst({ where: { id, deletedAt: null } })
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (source.type !== 'REQUISITION') {
    return NextResponse.json({ error: 'Backups can only be created from requisitions' }, { status: 400 })
  }

  const recruiter = await db.user.findUnique({ where: { id: parsed.data.recruiterId }, select: { id: true } })
  if (!recruiter) return NextResponse.json({ error: 'Lead recruiter not found' }, { status: 400 })

  const backup = await db.position.create({
    data: {
      title: parsed.data.title,
      recruiterId: recruiter.id,
      type: 'PROACTIVE',
      status: 'OPEN',
      sourcePositionId: source.id,
      applicationToken: randomBytes(32).toString('hex'),
      headcount: null,
      client: source.client,
      description: source.description,
      location: source.location,
      timezone: source.timezone,
      hiring_manager_name: source.hiring_manager_name,
      hiring_manager_email: source.hiring_manager_email,
      internalCostBudget: source.internalCostBudget,
      clientRate: source.clientRate,
      dgm: source.dgm,
      dgmAtRisk: source.dgmAtRisk,
      vendorMinFitScore: source.vendorMinFitScore,
      directMinFitScore: source.directMinFitScore,
      screeningQuestions: source.screeningQuestions,
      jdParsed: source.jdParsed,
      jdSummary: source.jdSummary,
      jdSkills: source.jdSkills,
      coreSkills: source.coreSkills,
      jdSeniority: source.jdSeniority,
      jdLanguages: source.jdLanguages,
      linkedinSearchQueries: source.linkedinSearchQueries,
    },
    select: { id: true },
  })

  return NextResponse.json(backup, { status: 201 })
}
