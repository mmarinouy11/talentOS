import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJDInBackground } from '@/lib/jd-parser'
import { computePositionDGM } from '@/lib/dgm'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { resolveEmailTemplate } from '@/lib/email-templates'

const CLOSED_DEFAULT_SUBJECT = 'Position update: {{positionTitle}}'
const CLOSED_DEFAULT_HTML = `<p>Hi {{vendorContactName}},</p>\n<p>The <strong>{{positionTitle}}</strong> position has been closed and is no longer accepting submissions.</p>\n<p>Thank you for your partnership.</p>\n<p>Best,<br/>Tenarai LATAM</p>`

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(['OPEN', 'ON_HOLD', 'CLOSED', 'FILLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  target_date_asap: z.boolean().optional(),
  target_date: z.string().datetime().optional().nullable(),
  location: z.array(z.string()).min(1).optional(),
  recruiterId: z.string().optional(),
  hiring_manager_email: z.string().email().optional().nullable(),
  hiring_manager_name: z.string().optional().nullable(),
  sales_contact_email: z.string().email().optional().nullable(),
  clientRate: z.number().optional().nullable(),
  internalCostBudget: z.number().optional().nullable(),
  vendorMinFitScore: z.number().int().min(0).max(100).optional().nullable(),
  directMinFitScore: z.number().int().min(0).max(100).optional().nullable(),
  screeningQuestions: z.array(z.string()).optional(),
  coreSkills: z.array(z.string()).optional(),
  talentId: z.string().optional().nullable(),
  reportingEmails: z.array(z.string().email()).optional(),
  reportingDays: z.array(z.string()).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const position = await db.position.findFirst({
    where: { id, deletedAt: null },
    include: {
      recruiter: { select: { id: true, name: true, email: true } },
      candidatePositions: {
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              seniority: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { candidatePositions: true } },
    },
  })

  if (!position) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(position)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.position.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const clientRate = parsed.data.clientRate !== undefined ? parsed.data.clientRate : existing.clientRate
  const internalCostBudget =
    parsed.data.internalCostBudget !== undefined ? parsed.data.internalCostBudget : existing.internalCostBudget
  const { dgm, dgmAtRisk } = await computePositionDGM(clientRate, internalCostBudget)

  const position = await db.position.update({
    where: { id },
    data: { ...parsed.data, dgm, dgmAtRisk },
  })

  if (parsed.data.description) parseJDInBackground(position.id)

  return NextResponse.json(position)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const existing = await db.position.findFirst({
    where: { id, deletedAt: null },
    include: {
      positionVendors: {
        include: { vendor: { select: { name: true, pocName: true, pocEmail: true } } },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  await db.position.update({ where: { id }, data: { deletedAt: new Date() } })

  // Notify assigned vendors (non-fatal)
  let notifiedCount = 0
  for (const pv of existing.positionVendors) {
    if (!pv.vendor.pocEmail) continue
    try {
      const { subject, html } = await resolveEmailTemplate(
        'TEMPLATE_POSITION_CLOSED',
        CLOSED_DEFAULT_SUBJECT,
        CLOSED_DEFAULT_HTML,
        { vendorContactName: pv.vendor.pocName ?? pv.vendor.name, positionTitle: existing.title, client: existing.client }
      )
      await sendEmailViaSystemGmail({ to: pv.vendor.pocEmail, subject, html })
      notifiedCount++
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ success: true, notifiedVendors: notifiedCount })
}
