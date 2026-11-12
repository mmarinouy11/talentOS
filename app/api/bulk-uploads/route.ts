import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/google'
import { requireBulkUploader } from '@/lib/bulk-upload-auth'
import { BULK_UPLOAD_MAX_BYTES, BULK_UPLOAD_MAX_FILES, BULK_UPLOAD_MIME, fileKind } from '@/lib/bulk-upload'
import { drainBulkUploadQueue } from '@/lib/bulk-upload-worker'

type Rejected = { fileName: string; error: string }

// Fast path: validate, upload each file to Drive, create the batch with PENDING items and return.
// Parsing, matching and scoring happen in the background worker.
export async function POST(request: Request) {
  const who = await requireBulkUploader()
  if (who instanceof NextResponse) return who

  const formData = await request.formData()
  const positionId = (formData.get('positionId') as string | null)?.trim() || null
  const files = formData.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f)

  if (files.length === 0) return NextResponse.json({ error: 'Choose at least one CV' }, { status: 400 })
  if (files.length > BULK_UPLOAD_MAX_FILES) {
    return NextResponse.json({ error: `Up to ${BULK_UPLOAD_MAX_FILES} files per batch (you selected ${files.length})` }, { status: 400 })
  }
  if (positionId) {
    const position = await db.position.findFirst({ where: { id: positionId, deletedAt: null }, select: { id: true } })
    if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })
  }

  const rejected: Rejected[] = []
  const accepted: { file: File; kind: 'pdf' | 'docx'; buffer: Buffer; hash: string }[] = []
  for (const file of files) {
    const kind = fileKind(file.name)
    if (!kind) { rejected.push({ fileName: file.name, error: 'Only PDF and DOCX files are supported' }); continue }
    if (file.size > BULK_UPLOAD_MAX_BYTES) { rejected.push({ fileName: file.name, error: 'File too large (max 10 MB)' }); continue }
    if (file.size === 0) { rejected.push({ fileName: file.name, error: 'File is empty' }); continue }
    const buffer = Buffer.from(await file.arrayBuffer())
    accepted.push({ file, kind, buffer, hash: createHash('sha256').update(buffer).digest('hex') })
  }
  if (accepted.length === 0) return NextResponse.json({ error: 'No valid CVs to upload', rejected }, { status: 400 })

  // Identical files within the batch: upload once, the copies are SKIPPED
  const seen = new Map<string, number>()
  const uploads: { fileName: string; hash: string; driveFileId: string; duplicate: boolean }[] = accepted.map((a, i) => {
    const dup = seen.has(a.hash)
    if (!dup) seen.set(a.hash, i)
    return { fileName: a.file.name, hash: a.hash, driveFileId: '', duplicate: dup }
  })

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!
  const queue = accepted.map((a, i) => ({ a, i })).filter(({ i }) => !uploads[i].duplicate)
  const failedUploads = new Set<number>()
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { a, i } = job
      try {
        const { fileId } = await uploadFileToDrive(a.buffer, `${Date.now()}_${a.file.name}`, BULK_UPLOAD_MIME[a.kind], folderId)
        uploads[i].driveFileId = fileId
      } catch (err) {
        console.error(`[bulk-upload] Drive upload failed for ${a.file.name}:`, err)
        failedUploads.add(i)
      }
    }
  }))
  // Copies share the original's Drive file
  uploads.forEach((u) => {
    if (u.duplicate) u.driveFileId = uploads[seen.get(u.hash)!].driveFileId
  })
  for (const i of failedUploads) rejected.push({ fileName: uploads[i].fileName, error: 'Upload to Drive failed' })
  const rows = uploads.filter((u, i) => !failedUploads.has(i) && !(u.duplicate && failedUploads.has(seen.get(u.hash)!)))
  if (rows.length === 0) return NextResponse.json({ error: 'No CVs could be uploaded', rejected }, { status: 502 })

  const batch = await db.bulkUpload.create({
    data: {
      createdById: who.userId,
      positionId,
      status: 'PROCESSING',
      totalFiles: rows.length,
      items: {
        create: rows.map((u) => ({
          fileName: u.fileName,
          fileHash: u.hash,
          driveFileId: u.driveFileId,
          status: u.duplicate ? 'SKIPPED' : 'PENDING',
          error: u.duplicate ? 'Duplicate file' : null,
        })),
      },
    },
    select: { id: true, totalFiles: true },
  })

  // Start right away instead of waiting for the next poll
  void drainBulkUploadQueue()

  return NextResponse.json({ id: batch.id, totalFiles: batch.totalFiles, rejected }, { status: 201 })
}
