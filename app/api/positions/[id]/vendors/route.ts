import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { vendorPositionAssignedEmail } from '@/lib/email-templates'

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

  // Remove unassigned vendors
  if (toRemove.length > 0) {
    await db.positionVendor.deleteMany({
      where: { positionId, vendorId: { in: toRemove } },
    })
  }

  // Add new vendors
  let emailError: string | null = null
  if (toAdd.length > 0) {
    await db.positionVendor.createMany({
      data: toAdd.map((vendorId) => ({ positionId, vendorId })),
      skipDuplicates: true,
    })

    // Send notification emails to newly added vendors
    const vendors = await db.vendor.findMany({
      where: { id: { in: toAdd } },
      select: { id: true, name: true, pocName: true, pocEmail: true, portalToken: true },
    })

    const baseUrl = process.env.NEXTAUTH_URL ?? ''
    for (const vendor of vendors) {
      if (!vendor.pocEmail || !vendor.portalToken) continue
      try {
        const { subject, html } = vendorPositionAssignedEmail({
          vendorContactName: vendor.pocName ?? vendor.name,
          positionTitle: position.title,
          client: position.client,
          portalLink: `${baseUrl}/vendor-portal/${vendor.portalToken}`,
        })
        await sendEmailViaSystemGmail({ to: vendor.pocEmail, subject, html })
      } catch (err) {
        console.error(`[position-vendors] Failed to notify vendor ${vendor.id}:`, err)
        emailError = 'Cannot send notification — connect a system Gmail account in Settings first.'
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
    emailError,
  })
}
