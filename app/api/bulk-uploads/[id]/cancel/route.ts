import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBulkUploader } from '@/lib/bulk-upload-auth'

// Candidates already created stay in the talent pool; pending items are skipped
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireBulkUploader()
  if (who instanceof NextResponse) return who
  const { id } = await params
  const batch = await db.bulkUpload.findUnique({ where: { id }, select: { status: true } })
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
    return NextResponse.json({ error: 'This batch is already closed' }, { status: 409 })
  }
  await db.$transaction([
    db.bulkUpload.update({ where: { id }, data: { status: 'CANCELLED' } }),
    db.bulkUploadItem.updateMany({ where: { bulkUploadId: id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Batch cancelled' } }),
  ])
  return NextResponse.json({ ok: true })
}
