import type { BulkUploadItemStatus, BulkUploadMatchType } from '@prisma/client'
import { db } from './db'

export interface BatchCounts {
  total: number
  processed: number
  new: number
  existing: number
  possible: number
  missingContact: number
  failed: number
  skipped: number
}

type CountRow = { status: BulkUploadItemStatus; matchType: BulkUploadMatchType | null }

export function countItems(items: CountRow[]): BatchCounts {
  return {
    total: items.length,
    processed: items.filter((i) => i.status !== 'PENDING' && i.status !== 'PROCESSING').length,
    new: items.filter((i) => i.status === 'DONE' && i.matchType === 'NEW').length,
    existing: items.filter((i) => i.status === 'DONE' && i.matchType === 'EXISTING').length,
    possible: items.filter((i) => i.status === 'NEEDS_DECISION' && i.matchType === 'POSSIBLE_DUPLICATE').length,
    missingContact: items.filter((i) => i.status === 'NEEDS_DECISION' && i.matchType === null).length,
    failed: items.filter((i) => i.status === 'FAILED').length,
    skipped: items.filter((i) => i.status === 'SKIPPED').length,
  }
}

export function batchLabel(position: { title: string; client: string } | null): string {
  return position ? `${position.title} · ${position.client}` : 'Talent pool'
}

// Home screen: READY batches for the uploader (ADMINs see everyone's)
export async function getReadyBulkUploads(userId: string, isAdmin: boolean) {
  const rows = await db.bulkUpload.findMany({
    where: { status: 'READY', ...(isAdmin ? {} : { createdById: userId }) },
    orderBy: { readyAt: 'desc' },
    take: 10,
    select: {
      id: true, totalFiles: true, readyAt: true,
      position: { select: { title: true, client: true } },
      createdBy: { select: { name: true, email: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    label: batchLabel(r.position),
    totalFiles: r.totalFiles,
    createdBy: r.createdBy.name ?? r.createdBy.email,
  }))
}

// Position page banner: batches still processing or waiting for review
export async function getOpenBulkUploadsForPosition(positionId: string) {
  const rows = await db.bulkUpload.findMany({
    where: { positionId, status: { in: ['PROCESSING', 'READY'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, totalFiles: true, items: { select: { status: true, matchType: true } } },
  })
  return rows.map((r) => ({ id: r.id, status: r.status, totalFiles: r.totalFiles, counts: countItems(r.items) }))
}
