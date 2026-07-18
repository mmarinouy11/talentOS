import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { resolveEmailTemplate } from '@/lib/email-resolver'

const ASSIGNED_DEFAULT_SUBJECT = 'New position available: {{positionTitle}}'
const ASSIGNED_DEFAULT_HTML = `<p>Hi {{vendorContactName}},</p>\n<p>You've been granted access to submit candidates for a new position: <strong>{{positionTitle}}</strong>.</p>\n<p><a href="{{portalLink}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Position &amp; Submit Candidates</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`

const postSchema = z.object({ positionId: z.string() })

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: vendorId } = await params

  const assigned = await db.positionVendor.findMany({
    where: { vendorId },
    include: { position: { select: { id: true, title: true, client: true, status: true } } },
    orderBy: { assignedAt: 'asc' },
  })

  const assignedPositionIds = assigned.map((r) => r.positionId)

  const available = await db.position.findMany({
    where: {
      status: 'OPEN',
      deletedAt: null,
      id: { notIn: assignedPositionIds },
    },
    select: { id: true, title: true, client: true, status: true },
    orderBy: { title: 'asc' },
  })

  return NextResponse.json({
    assigned: assigned.map((r) => r.position),
    available,
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: vendorId } = await params

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { positionId } = parsed.data

  const position = await db.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { id: true, title: true, client: true },
  })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  await db.positionVendor.upsert({
    where: { positionId_vendorId: { positionId, vendorId } },
    create: { positionId, vendorId },
    update: {},
  })

  let emailSuccess = false
  const systemAccount = await db.systemEmailAccount.findUnique({
    where: { purpose: 'system_notifications' },
    select: { refreshToken: true },
  })

  if (systemAccount?.refreshToken && vendor.pocEmail && vendor.portalToken) {
    try {
      const baseUrl = process.env.NEXTAUTH_URL ?? ''
      const { subject, html } = await resolveEmailTemplate(
        'TEMPLATE_VENDOR_ASSIGNED',
        ASSIGNED_DEFAULT_SUBJECT,
        ASSIGNED_DEFAULT_HTML,
        {
          vendorContactName: vendor.pocName ?? vendor.name,
          positionTitle: position.title,
          client: position.client,
          portalLink: `${baseUrl}/vendor-portal/${vendor.portalToken}`,
        }
      )
      await sendEmailViaSystemGmail({ to: vendor.pocEmail, subject, html })
      emailSuccess = true
    } catch (err) {
      console.error('[vendor-positions POST] email failed:', err)
    }
  }

  return NextResponse.json({ emailSuccess })
}
