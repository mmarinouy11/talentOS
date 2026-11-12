import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireBulkUploader } from '@/lib/bulk-upload-auth'
import { BulkItemError, decideBulkItem, readableItemError } from '@/lib/bulk-upload'
import { db } from '@/lib/db'

const schema = z.object({ decision: z.enum(['same', 'different']) })

export async function POST(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const who = await requireBulkUploader()
  if (who instanceof NextResponse) return who
  const { id, itemId } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })

  const item = await db.bulkUploadItem.findFirst({ where: { id: itemId, bulkUploadId: id }, select: { id: true } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    await decideBulkItem(itemId, parsed.data.decision)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[bulk-upload] Decision failed for item ${itemId}:`, err)
    return NextResponse.json({ error: readableItemError(err) }, { status: err instanceof BulkItemError ? 409 : 500 })
  }
}
