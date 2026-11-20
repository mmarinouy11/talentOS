import type { Prisma } from '@prisma/client'
import { db } from './db'
import { downloadFileFromDrive } from './google'
import { parseCvFromBuffer, type ParsedCv } from './cv-parser'
import { extractPdfText } from './pdf-extract'
import { classifyAnthropicError, ClaudeOutputTruncatedError } from './anthropic'

export const CV_PARSE_TIMEOUT_MS = 120_000

export type CvKind = 'pdf' | 'docx' | 'unsupported'

// By content, not by name: PDFs start with %PDF, DOCX files are zip archives (PK\x03\x04)
export function detectCvKind(buffer: Buffer): CvKind {
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf'
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return 'docx'
  return 'unsupported'
}

// PDF with almost no extractable text → scanned (needs image parsing). No AI involved.
export async function isScannedPdf(buffer: Buffer): Promise<boolean> {
  const text = await extractPdfText(buffer).catch(() => '')
  return text.trim().length < 100
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`parsing the CV took longer than ${Math.round(ms / 1000)} seconds`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

// Human-readable reason, shown on the CV error page and in the backfill summary
export function cvParseErrorReason(err: unknown): string {
  if (err instanceof ClaudeOutputTruncatedError) return `the CV is too long: ${err.message}`
  const ai = classifyAnthropicError(err)
  if (ai?.name === 'AnthropicQuotaError') return 'AI credit unavailable'
  if (ai?.name === 'AnthropicConfigError') return 'AI is not configured'
  const msg = err instanceof Error ? err.message : String(err)
  if (/not ?found|404|File not found/i.test(msg)) return 'the CV file was not found in Drive'
  if (/invalid JSON/i.test(msg)) return 'the AI answer could not be read (invalid JSON)'
  return msg || 'unknown error'
}

export type FillResult =
  | { status: 'filled'; experienceCount: number }
  | { status: 'already'; experienceCount: number }
  | { status: 'no-cv' }
  | { status: 'no-experience-in-cv' }
  | { status: 'failed'; reason: string }

const arr = (v: unknown) => (Array.isArray(v) ? v : [])
const isEmptyJson = (v: Prisma.JsonValue | null) => !Array.isArray(v) || v.length === 0

// Parses the candidate's stored CV and fills ONLY empty fields (cvExperience, cvEducation, summary, skills).
// Existing data is never overwritten.
export async function fillCvExperienceFromDrive(candidateId: string): Promise<FillResult> {
  const c = await db.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, cvDriveId: true, cvExperience: true, cvEducation: true, summary: true, skills: true },
  })
  if (!c) return { status: 'failed', reason: 'candidate not found' }
  if (!isEmptyJson(c.cvExperience)) return { status: 'already', experienceCount: (c.cvExperience as unknown[]).length }
  if (!c.cvDriveId) return { status: 'no-cv' }

  let parsed: ParsedCv
  try {
    const buffer = await downloadFileFromDrive(c.cvDriveId)
    const kind = detectCvKind(buffer)
    if (kind === 'unsupported') return { status: 'failed', reason: 'the CV file is neither a PDF nor a DOCX' }
    parsed = await withTimeout(parseCvFromBuffer(buffer, kind), CV_PARSE_TIMEOUT_MS)
  } catch (err) {
    return { status: 'failed', reason: cvParseErrorReason(err) }
  }

  const experience = arr(parsed.experience).filter((e) => e && typeof e === 'object')
  const education = arr(parsed.education).filter((e) => e && typeof e === 'object')
  const data: Prisma.CandidateUpdateInput = {}
  if (experience.length > 0) data.cvExperience = experience as Prisma.InputJsonValue
  if (education.length > 0 && isEmptyJson(c.cvEducation)) data.cvEducation = education as Prisma.InputJsonValue
  if (!c.summary?.trim() && typeof parsed.summary === 'string' && parsed.summary.trim()) data.summary = parsed.summary.trim()
  const skills = arr(parsed.skills).filter((s): s is string => typeof s === 'string' && s.trim() !== '')
  if (c.skills.length === 0 && skills.length > 0) data.skills = skills
  if (Object.keys(data).length > 0) {
    await db.candidate.update({ where: { id: c.id }, data })
  }
  return experience.length > 0 ? { status: 'filled', experienceCount: experience.length } : { status: 'no-experience-in-cv' }
}
