import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'

const schema = z.object({
  title: z.string().trim().min(1),
  recruiterId: z.string().min(1),
  carryCandidates: z.boolean().default(false),
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

  const userId = (session.user as { id?: string }).id!
  const carried = parsed.data.carryCandidates
    ? await db.candidatePosition.findMany({
        where: { positionId: source.id, status: 'ACTIVE', candidate: { deletedAt: null } },
      })
    : []
  const carryNote = `Carried over from: ${source.title}`

  const backup = await db.$transaction(async (tx) => {
   const created = await tx.position.create({
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

   // Original candidate-positions are left untouched; interviews and prior history stay there.
   // createdAt/stageEnteredAt are preserved so aging and sourcing metrics don't treat them as new.
   for (const cp of carried) {
     await tx.candidatePosition.create({
       data: {
         candidateId: cp.candidateId,
         positionId: created.id,
         recruiterId: cp.recruiterId,
         stage: cp.stage,
         status: 'ACTIVE',
         stageEnteredAt: cp.stageEnteredAt,
         createdAt: cp.createdAt,
         fitScore: cp.fitScore,
         technicalFitScore: cp.technicalFitScore,
         seniorityFitScore: cp.seniorityFitScore,
         domainFitScore: cp.domainFitScore,
         communicationFitScore: cp.communicationFitScore,
         fitSummary: cp.fitSummary,
         fitStrengths: cp.fitStrengths,
         fitGaps: cp.fitGaps,
         fitScoredAt: cp.fitScoredAt,
         notes: cp.notes ? `${carryNote}\n\n${cp.notes}` : carryNote,
         stageHistory: {
           create: {
             fromStage: null,
             toStage: cp.stage,
             movedAt: cp.stageEnteredAt,
             movedById: userId,
             notes: `Carried over from ${source.title}`,
           },
         },
       },
     })
   }
   return created
  })

  return NextResponse.json(backup, { status: 201 })
}
