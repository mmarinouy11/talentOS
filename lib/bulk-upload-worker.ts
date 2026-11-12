import { db } from './db'
import { processBulkItem, refreshBatchStatus, BULK_UPLOAD_MAX_ATTEMPTS } from './bulk-upload'

// DB-backed queue for bulk CV uploads: state lives in BulkUploadItem, so work survives restarts.
const POLL_MS = 15_000
const CONCURRENCY = 2
const STUCK_MS = 10 * 60_000

// On globalThis so route handlers and instrumentation share the guards even if bundled separately.
// Claims are atomic in the DB, so a second instance would still never process an item twice.
const g = globalThis as unknown as { __bulkUploadWorker?: { started: boolean; draining: boolean } }
const state = (g.__bulkUploadWorker ??= { started: false, draining: false })

// Items left PROCESSING by a crash/restart for too long go back to PENDING (or FAILED after the last attempt)
async function releaseStuckItems() {
  const cutoff = new Date(Date.now() - STUCK_MS)
  const stuck = await db.bulkUploadItem.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
    select: { id: true, attempts: true, bulkUploadId: true },
  })
  for (const s of stuck) {
    const failed = s.attempts >= BULK_UPLOAD_MAX_ATTEMPTS
    await db.bulkUploadItem.update({
      where: { id: s.id },
      data: { status: failed ? 'FAILED' : 'PENDING', error: failed ? 'Processing timed out' : null },
    })
    if (failed) await refreshBatchStatus(s.bulkUploadId)
  }
}

// Atomically claims a PENDING item (oldest first); null when the queue is empty
async function claimNext(): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const next = await db.bulkUploadItem.findFirst({
      where: { status: 'PENDING', bulkUpload: { status: { in: ['PROCESSING', 'READY'] } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (!next) return null
    const claimed = await db.bulkUploadItem.updateMany({
      where: { id: next.id, status: 'PENDING' },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    })
    if (claimed.count === 1) return next.id
  }
  return null
}

async function runLane() {
  for (;;) {
    const id = await claimNext()
    if (!id) return
    await processBulkItem(id)
  }
}

// Processes the queue until empty with CONCURRENCY lanes. Safe to call any time (no-op while draining).
export async function drainBulkUploadQueue(): Promise<void> {
  if (state.draining) return
  state.draining = true
  try {
    await releaseStuckItems()
    await Promise.all(Array.from({ length: CONCURRENCY }, () => runLane()))
  } catch (err) {
    console.error('[bulk-upload] Worker error:', err)
  } finally {
    state.draining = false
  }
}

export function startBulkUploadWorker() {
  if (state.started) return
  state.started = true
  setInterval(() => { void drainBulkUploadQueue() }, POLL_MS)
  void drainBulkUploadQueue()
  console.log('[bulk-upload] Worker started (every 15s, concurrency 2)')
}
