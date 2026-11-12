import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireBulkUploader } from '@/lib/bulk-upload-auth'
import { addCandidateToPosition } from '@/lib/candidate-position-create'
import { applyFitResult, getOrComputeFitScore, scoreCandidateForPosition } from '@/lib/fit-scorer'

const schema = z.object({ itemIds: z.array(z.string()).max(50) })

// Adds the selected candidates to the batch's position: first stage, recruiter = the uploader,
// StageHistory entry, fit score from the cache. Unselected candidates stay in the talent pool.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireBulkUploader()
  if (who instanceof NextResponse) return who
  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid selection' }, { status: 400 })

  const batch = await db.bulkUpload.findUnique({ where: { id } })
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!batch.positionId) return NextResponse.json({ error: 'This batch has no position' }, { status: 400 })
  if (batch.status === 'PROCESSING') return NextResponse.json({ error: 'Wait until all CVs are processed' }, { status: 409 })
  if (batch.status !== 'READY') return NextResponse.json({ error: 'This batch is already closed' }, { status: 409 })
  const positionId = batch.positionId

  const items = await db.bulkUploadItem.findMany({
    where: { bulkUploadId: id, id: { in: parsed.data.itemIds }, status: 'DONE', candidateId: { not: null }, candidatePositionId: null },
  })

  let added = 0
  const errors: { itemId: string; error: string }[] = []
  for (const item of items) {
    const candidateId = item.candidateId!
    try {
      const existing = await db.candidatePosition.findFirst({ where: { candidateId, positionId }, select: { id: true } })
      if (existing) {
        await db.bulkUploadItem.update({ where: { id: item.id }, data: { alreadyInPosition: true } })
        continue
      }
      const cp = await addCandidateToPosition({ candidateId, positionId, recruiterId: batch.createdById, movedById: who.userId })
      await db.bulkUploadItem.update({ where: { id: item.id }, data: { selected: true, candidatePositionId: cp.id } })
      added++
      // Same inputs as the batch scoring → cached result, identical numbers. Better match runs afterwards in the background.
      const result = await getOrComputeFitScore(candidateId, positionId).catch(() => null)
      if (result) await applyFitResult(cp.id, result)
      scoreCandidateForPosition(cp.id).catch((err) => console.error(`[bulk-upload] Background scoring failed for ${cp.id}:`, err))
    } catch (err) {
      console.error(`[bulk-upload] Could not add item ${item.id} to position:`, err)
      errors.push({ itemId: item.id, error: 'Could not add to the pipeline' })
    }
  }

  await db.bulkUpload.update({ where: { id }, data: { status: 'COMPLETED', confirmedAt: new Date() } })
  return NextResponse.json({ added, errors })
}
