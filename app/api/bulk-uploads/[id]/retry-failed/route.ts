import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireBulkUploader } from '@/lib/bulk-upload-auth'
import { drainBulkUploadQueue } from '@/lib/bulk-upload-worker'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireBulkUploader()
  if (who instanceof NextResponse) return who
  const { id } = await params
  const batch = await db.bulkUpload.findUnique({ where: { id }, select: { status: true } })
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (batch.status === 'COMPLETED' || batch.status === 'CANCELLED') {
    return NextResponse.json({ error: 'This batch is closed' }, { status: 409 })
  }
  const { count } = await db.bulkUploadItem.updateMany({
    where: { bulkUploadId: id, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, error: null },
  })
  if (count > 0) {
    await db.bulkUpload.update({ where: { id }, data: { status: 'PROCESSING', readyAt: null } })
    void drainBulkUploadQueue()
  }
  return NextResponse.json({ retried: count })
}
