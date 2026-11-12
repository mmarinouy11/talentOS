import type { Prisma } from '@prisma/client'
import { db } from './db'
import { downloadFileFromDrive } from './google'
import { parseCvFromBuffer, type ParsedCv } from './cv-parser'
import { findCandidateMatches } from './candidate-identity'
import { hasCandidateIdentifier, realEmailOrNull } from './candidate-identifier'
import { createCandidateRecord } from './candidate-create'
import { getOrComputeFitScore } from './fit-scorer'
import { classifyAnthropicError } from './anthropic'

export const BULK_UPLOAD_MAX_FILES = 50
export const BULK_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const BULK_UPLOAD_MAX_ATTEMPTS = 3
export const BULK_UPLOAD_PRESELECT_SCORE_DEFAULT = 70

export const BULK_UPLOAD_MIME: Record<'pdf' | 'docx', string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function fileKind(fileName: string): 'pdf' | 'docx' | null {
  const ext = fileName.toLowerCase().split('.').pop()
  return ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : null
}

export async function getBulkUploadPreselectScore(): Promise<number> {
  const row = await db.systemSettings.findUnique({ where: { key: 'BULK_UPLOAD_PRESELECT_SCORE' } })
  const n = row ? Number(row.value) : NaN
  return Number.isFinite(n) && n >= 0 ? n : BULK_UPLOAD_PRESELECT_SCORE_DEFAULT
}

// Error whose message is safe to show on the review page as-is
export class BulkItemError extends Error {
  constructor(message: string, readonly permanent = false) { super(message); this.name = 'BulkItemError' }
}

export function readableItemError(err: unknown): string {
  if (err instanceof BulkItemError) return err.message
  const ai = classifyAnthropicError(err)
  if (ai?.name === 'AnthropicQuotaError') return 'AI credit unavailable'
  if (ai?.name === 'AnthropicConfigError') return 'AI is not configured'
  const msg = err instanceof Error ? err.message : ''
  if (/not ?found|404/i.test(msg)) return 'CV file not found in Drive'
  if (/json/i.test(msg)) return 'Could not read this CV'
  return 'Could not process this CV'
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002'
}

type ItemWithBatch = Prisma.BulkUploadItemGetPayload<{ include: { bulkUpload: true } }>

// Fields of the parsed CV kept on the item until a decision is made (possible duplicates)
type Snapshot = Pick<ParsedCv, 'firstName' | 'lastName' | 'email' | 'phone' | 'country' | 'linkedinUrl' | 'seniority'
  | 'yearsOfExperience' | 'skills' | 'languages' | 'summary' | 'experience' | 'education'>

function toSnapshot(p: ParsedCv): Snapshot {
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []) as string[]
  return {
    firstName: p.firstName?.trim() || null,
    lastName: p.lastName?.trim() || null,
    email: realEmailOrNull(p.email),
    phone: p.phone?.trim() || null,
    country: p.country?.trim() || null,
    linkedinUrl: p.linkedinUrl?.trim() || null,
    seniority: p.seniority ?? null,
    yearsOfExperience: typeof p.yearsOfExperience === 'number' ? Math.round(p.yearsOfExperience) : null,
    skills: arr(p.skills),
    languages: arr(p.languages),
    summary: p.summary?.trim() || null,
    experience: Array.isArray(p.experience) ? p.experience : [],
    education: Array.isArray(p.education) ? p.education : [],
  }
}

const SENIORITIES = ['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL'] as const

// New candidate from the CV, exactly like "Create New": sourced by the uploader, CV linked. Email stays null
// when the CV has none (never a placeholder).
async function createFromSnapshot(snap: Snapshot, item: ItemWithBatch): Promise<string> {
  if (!hasCandidateIdentifier(snap.email, snap.linkedinUrl)) {
    throw new BulkItemError('No email or LinkedIn profile found in this CV', true)
  }
  const uploader = item.bulkUpload.createdById
  try {
    const c = await createCandidateRecord({
      firstName: snap.firstName ?? '',
      lastName: snap.lastName ?? '',
      email: snap.email,
      phone: snap.phone,
      country: snap.country,
      linkedinUrl: snap.linkedinUrl,
      seniority: snap.seniority && (SENIORITIES as readonly string[]).includes(snap.seniority) ? snap.seniority : undefined,
      yearsOfExperience: snap.yearsOfExperience,
      skills: snap.skills,
      languages: snap.languages,
      summary: snap.summary,
      cvDriveId: item.driveFileId,
      cvOriginalName: item.fileName,
      cvExperience: snap.experience,
      cvEducation: snap.education,
      recruiterId: uploader,
      sourcedByType: 'RECRUITER',
      sourcedByUserId: uploader,
    })
    return c.id
  } catch (err) {
    if (isUniqueViolation(err)) throw new BulkItemError('This email or LinkedIn belongs to a deleted candidate', true)
    throw err
  }
}

// Position batches: flag candidates already in the position, otherwise store the real (cached) fit score.
// Better match is not computed here.
async function scoreForBatch(itemId: string, candidateId: string, positionId: string | null) {
  if (!positionId) return
  const existing = await db.candidatePosition.findFirst({ where: { candidateId, positionId }, select: { id: true } })
  if (existing) {
    await db.bulkUploadItem.update({ where: { id: itemId }, data: { alreadyInPosition: true } })
    return
  }
  try {
    const r = await getOrComputeFitScore(candidateId, positionId)
    if (r) await db.bulkUploadItem.update({ where: { id: itemId }, data: { fitScore: Math.round(r.fitScore) } })
  } catch (err) {
    // The candidate is resolved; a missing score must not re-run the item
    console.error(`[bulk-upload] Scoring failed for item ${itemId}:`, err)
    await db.bulkUploadItem.update({ where: { id: itemId }, data: { error: `Fit score unavailable (${readableItemError(err)})` } })
  }
}

// Processes one item that the worker has already claimed (status PROCESSING, attempts incremented)
export async function processBulkItem(itemId: string): Promise<void> {
  const item = await db.bulkUploadItem.findUnique({ where: { id: itemId }, include: { bulkUpload: true } })
  if (!item || item.status !== 'PROCESSING') return
  if (item.bulkUpload.status === 'CANCELLED') {
    await db.bulkUploadItem.update({ where: { id: itemId }, data: { status: 'SKIPPED', error: 'Batch cancelled' } })
    return
  }

  try {
    const kind = fileKind(item.fileName)
    if (!kind) throw new BulkItemError('Only PDF and DOCX files are supported', true)
    const buffer = await downloadFileFromDrive(item.driveFileId)
    const snap = toSnapshot(await parseCvFromBuffer(buffer, kind))
    if (!snap.firstName) throw new BulkItemError('Could not read a name from this CV', true)

    const parsedName = [snap.firstName, snap.lastName].filter(Boolean).join(' ')
    const base = { parsedName, parsedEmail: snap.email, parsedSnapshot: snap as unknown as Prisma.InputJsonValue, error: null }

    // Identity: the DB already holds candidates created earlier in this batch, so a second file of the
    // same person resolves to the first one. A concurrent create of the same person hits the unique
    // email/LinkedIn constraint, and the retry below resolves it as existing.
    for (let pass = 0; pass < 2; pass++) {
      const match = await findCandidateMatches({ ...snap, lastName: snap.lastName ?? '' })
      if (match.kind === 'exact') {
        const candidateId = match.candidates[0].id
        await db.bulkUploadItem.update({ where: { id: itemId }, data: { ...base, matchType: 'EXISTING', candidateId } })
        await scoreForBatch(itemId, candidateId, item.bulkUpload.positionId)
        await db.bulkUploadItem.update({ where: { id: itemId }, data: { status: 'DONE' } })
        return
      }
      if (match.kind === 'possible' || match.kind === 'conflict') {
        await db.bulkUploadItem.update({
          where: { id: itemId },
          data: { ...base, matchType: 'POSSIBLE_DUPLICATE', status: 'NEEDS_DECISION', possibleDuplicateOfId: match.candidates[0].id },
        })
        return
      }
      try {
        const candidateId = await createFromSnapshot(snap, item)
        await db.bulkUploadItem.update({ where: { id: itemId }, data: { ...base, matchType: 'NEW', candidateId } })
        await scoreForBatch(itemId, candidateId, item.bulkUpload.positionId)
        await db.bulkUploadItem.update({ where: { id: itemId }, data: { status: 'DONE' } })
        return
      } catch (err) {
        // Same person created concurrently: match again (now exact)
        if (pass === 0 && err instanceof BulkItemError && /deleted candidate/.test(err.message)) {
          const again = await findCandidateMatches({ ...snap, lastName: snap.lastName ?? '' })
          if (again.kind !== 'none') continue
        }
        throw err
      }
    }
    throw new BulkItemError('Could not resolve this candidate')
  } catch (err) {
    const permanent = err instanceof BulkItemError && err.permanent
    const failed = permanent || item.attempts >= BULK_UPLOAD_MAX_ATTEMPTS
    console.error(`[bulk-upload] Item ${itemId} (${item.fileName}) attempt ${item.attempts} failed:`, err)
    await db.bulkUploadItem.update({
      where: { id: itemId },
      data: { status: failed ? 'FAILED' : 'PENDING', error: readableItemError(err) },
    })
  } finally {
    await refreshBatchStatus(item.bulkUploadId)
  }
}

// PROCESSING → READY once nothing is pending; pool-only batches complete once nothing needs a decision
export async function refreshBatchStatus(bulkUploadId: string): Promise<void> {
  const batch = await db.bulkUpload.findUnique({ where: { id: bulkUploadId } })
  if (!batch || batch.status === 'COMPLETED' || batch.status === 'CANCELLED') return
  const counts = await db.bulkUploadItem.groupBy({ by: ['status'], where: { bulkUploadId }, _count: true })
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0
  const busy = n('PENDING') + n('PROCESSING')
  if (busy > 0) {
    if (batch.status !== 'PROCESSING') await db.bulkUpload.update({ where: { id: bulkUploadId }, data: { status: 'PROCESSING' } })
    return
  }
  const now = new Date()
  if (!batch.positionId && n('NEEDS_DECISION') === 0) {
    await db.bulkUpload.update({ where: { id: bulkUploadId }, data: { status: 'COMPLETED', readyAt: batch.readyAt ?? now, confirmedAt: now } })
  } else if (batch.status === 'PROCESSING') {
    await db.bulkUpload.update({ where: { id: bulkUploadId }, data: { status: 'READY', readyAt: now } })
  }
}

// Possible duplicate resolution. "same" links the existing candidate (never modified); "different" creates
// a new candidate from the stored snapshot and file.
export async function decideBulkItem(itemId: string, decision: 'same' | 'different'): Promise<void> {
  const item = await db.bulkUploadItem.findUnique({ where: { id: itemId }, include: { bulkUpload: true } })
  if (!item || item.status !== 'NEEDS_DECISION') throw new BulkItemError('This row no longer needs a decision')
  if (item.bulkUpload.status === 'CANCELLED' || item.bulkUpload.status === 'COMPLETED') throw new BulkItemError('This batch is closed')

  let candidateId: string
  if (decision === 'same') {
    if (!item.possibleDuplicateOfId) throw new BulkItemError('No existing candidate to link')
    const existing = await db.candidate.findFirst({ where: { id: item.possibleDuplicateOfId, deletedAt: null }, select: { id: true } })
    if (!existing) throw new BulkItemError('The existing candidate was deleted')
    candidateId = existing.id
    await db.bulkUploadItem.update({ where: { id: itemId }, data: { matchType: 'EXISTING', candidateId, error: null } })
  } else {
    const snap = item.parsedSnapshot as unknown as Snapshot | null
    if (!snap?.firstName) throw new BulkItemError('Parsed CV data is missing; retry the upload')
    candidateId = await createFromSnapshot(snap, item)
    await db.bulkUploadItem.update({ where: { id: itemId }, data: { matchType: 'NEW', candidateId, error: null } })
  }
  await scoreForBatch(itemId, candidateId, item.bulkUpload.positionId)
  await db.bulkUploadItem.update({ where: { id: itemId }, data: { status: 'DONE' } })
  await refreshBatchStatus(item.bulkUploadId)
}
