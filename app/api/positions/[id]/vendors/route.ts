import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { resolveEmailTemplate } from '@/lib/email-templates'

const ASSIGNED_DEFAULT_SUBJECT = 'New position available: {{positionTitle}}'
const ASSIGNED_DEFAULT_HTML = `<p>Hi {{vendorContactName}},</p>\n<p>You've been granted access to submit candidates for a new position: <strong>{{positionTitle}}</strong>.</p>\n<p><a href="{{portalLink}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Position &amp; Submit Candidates</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`
const REMOVED_DEFAULT_SUBJECT = 'Position update: {{positionTitle}}'
const REMOVED_DEFAULT_HTML = `<p>Hi {{vendorContactName}},</p>\n<p>You have been removed from the sourcing list for <strong>{{positionTitle}}</strong>. Please stop submitting candidates for this position.</p>\n<p>Best,<br/>Tenarai LATAM</p>`

const patchSchema = z.object({
  vendorIds: z.array(z.string()),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await db.positionVendor.findMany({
    where: { positionId: id },
    include: { vendor: { select: { id: true, name: true, pocName: true, pocEmail: true, portalToken: true } } },
    orderBy: { assignedAt: 'asc' },
  })

  return NextResponse.json(rows.map((r) => r.vendor))
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: positionId } = await params

  const position = await db.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { id: true, title: true, client: true },
  })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { vendorIds } = parsed.data

  // Current assignments
  const current = await db.positionVendor.findMany({ where: { positionId } })
  const currentIds = new Set(current.map((r) => r.vendorId))
  const desiredIds = new Set(vendorIds)

  const toAdd = vendorIds.filter((vid) => !currentIds.has(vid))
  const toRemove = [...currentIds].filter((vid) => !desiredIds.has(vid))

  // Check upfront whether system Gmail is connected
  const systemAccount = await db.systemEmailAccount.findUnique({
    where: { purpose: 'system_notifications' },
    select: { refreshToken: true, connectedEmail: true },
  })
  const gmailConnected = !!systemAccount?.refreshToken

  const emailWarnings: string[] = []
  const emailSuccesses: string[] = []

  // Remove unassigned vendors and notify them
  if (toRemove.length > 0) {
    const removedVendors = await db.vendor.findMany({
      where: { id: { in: toRemove } },
      select: { id: true, name: true, pocName: true, pocEmail: true },
    })
    await db.positionVendor.deleteMany({
      where: { positionId, vendorId: { in: toRemove } },
    })
    if (gmailConnected) {
      for (const vendor of removedVendors) {
        if (!vendor.pocEmail) continue
        try {
          const { subject, html } = await resolveEmailTemplate(
            'TEMPLATE_VENDOR_REMOVED',
            REMOVED_DEFAULT_SUBJECT,
            REMOVED_DEFAULT_HTML,
            { vendorContactName: vendor.pocName ?? vendor.name, positionTitle: position.title, client: position.client }
          )
          await sendEmailViaSystemGmail({ to: vendor.pocEmail, subject, html })
        } catch (err) {
          console.error(`[position-vendors] removal email failed for ${vendor.pocEmail}:`, err)
        }
      }
    }
  }

  // Add new vendors and send notification emails

  if (toAdd.length > 0) {
    await db.positionVendor.createMany({
      data: toAdd.map((vendorId) => ({ positionId, vendorId })),
      skipDuplicates: true,
    })

    const vendors = await db.vendor.findMany({
      where: { id: { in: toAdd } },
      select: { id: true, name: true, pocName: true, pocEmail: true, portalToken: true },
    })

    console.log(`[position-vendors] system Gmail connected: ${gmailConnected}, account: ${systemAccount?.connectedEmail ?? 'none'}`)

    const baseUrl = process.env.NEXTAUTH_URL ?? ''

    for (const vendor of vendors) {
      console.log(`[position-vendors] notifying vendor "${vendor.name}" (${vendor.id}): pocEmail=${vendor.pocEmail ?? 'NOT SET'}, portalToken=${vendor.portalToken ? 'set' : 'NOT SET'}`)

      if (!vendor.portalToken) {
        console.warn(`[position-vendors] vendor ${vendor.id} has no portalToken — skipping email`)
        emailWarnings.push(`${vendor.name}: no portal link generated yet (visit the partner's edit page to regenerate).`)
        continue
      }

      if (!vendor.pocEmail) {
        console.warn(`[position-vendors] vendor ${vendor.id} has no pocEmail — skipping email`)
        emailWarnings.push(`${vendor.name}: no contact email on record — add one on their edit page to receive notifications.`)
        continue
      }

      if (!gmailConnected) {
        console.warn('[position-vendors] system Gmail not connected — cannot send notification')
        emailWarnings.push(`Could not email ${vendor.name} (${vendor.pocEmail}) — no system Gmail account connected. Go to Settings to connect one.`)
        continue
      }

      try {
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
        console.log(`[position-vendors] sending assignment email to ${vendor.pocEmail}`)
        await sendEmailViaSystemGmail({ to: vendor.pocEmail, subject, html })
        console.log(`[position-vendors] email sent successfully to ${vendor.pocEmail}`)
        emailSuccesses.push(vendor.name)
      } catch (err) {
        console.error(`[position-vendors] send failed for vendor ${vendor.id} (${vendor.pocEmail}):`, err)
        emailWarnings.push(`Failed to email ${vendor.name} (${vendor.pocEmail}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const updatedVendors = await db.positionVendor.findMany({
    where: { positionId },
    include: { vendor: { select: { id: true, name: true, pocName: true, pocEmail: true, portalToken: true } } },
    orderBy: { assignedAt: 'asc' },
  })

  return NextResponse.json({
    vendors: updatedVendors.map((r) => r.vendor),
    emailError: emailWarnings.length > 0 ? emailWarnings.join(' | ') : null,
    emailSuccesses,
  })
}
