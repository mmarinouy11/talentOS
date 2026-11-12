import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireBulkUploader } from '@/lib/bulk-upload-auth'
import { BulkItemError, readableItemError, supplyBulkItemContact } from '@/lib/bulk-upload'

const schema = z.object({
  email: z.string().trim().email().optional().nullable(),
  linkedinUrl: z.string().trim().optional().nullable(),
}).refine((v) => !!v.email || !!v.linkedinUrl, { message: 'Enter an email or a LinkedIn profile URL' })

// Missing contact rows: add an email or LinkedIn URL, then match / create / score as usual
export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const who = await requireBulkUploader()
  if (who instanceof NextResponse) return who
  const { id, itemId } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message === 'Invalid email' ? 'Enter a valid email address' : (parsed.error.issues[0]?.message ?? 'Invalid contact') }, { status: 400 })
  }
  const item = await db.bulkUploadItem.findFirst({ where: { id: itemId, bulkUploadId: id }, select: { id: true } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    await supplyBulkItemContact(itemId, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[bulk-upload] Contact update failed for item ${itemId}:`, err)
    return NextResponse.json({ error: readableItemError(err) }, { status: err instanceof BulkItemError ? 409 : 500 })
  }
}
