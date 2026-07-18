import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { resolveEmailTemplate } from '@/lib/email-resolver'

const REMOVED_DEFAULT_SUBJECT = 'Position update: {{positionTitle}}'
const REMOVED_DEFAULT_HTML = `<p>Hi {{vendorContactName}},</p>\n<p>You have been removed from the sourcing list for <strong>{{positionTitle}}</strong>. Please stop submitting candidates for this position.</p>\n<p>Best,<br/>Tenarai LATAM</p>`

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; positionId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: vendorId, positionId } = await params

  const vendor = await db.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const position = await db.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { id: true, title: true, client: true },
  })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  await db.positionVendor.deleteMany({ where: { positionId, vendorId } })

  let emailSuccess = false
  const systemAccount = await db.systemEmailAccount.findUnique({
    where: { purpose: 'system_notifications' },
    select: { refreshToken: true },
  })

  if (systemAccount?.refreshToken && vendor.pocEmail) {
    try {
      const { subject, html } = await resolveEmailTemplate(
        'TEMPLATE_VENDOR_REMOVED',
        REMOVED_DEFAULT_SUBJECT,
        REMOVED_DEFAULT_HTML,
        {
          vendorContactName: vendor.pocName ?? vendor.name,
          positionTitle: position.title,
          client: position.client,
        }
      )
      await sendEmailViaSystemGmail({ to: vendor.pocEmail, subject, html })
      emailSuccess = true
    } catch (err) {
      console.error('[vendor-positions DELETE] email failed:', err)
    }
  }

  return NextResponse.json({ emailSuccess })
}
