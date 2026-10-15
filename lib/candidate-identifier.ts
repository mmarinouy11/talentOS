import { isPlaceholderEmail } from '@/lib/import-jobs'
import { normalizeLinkedinHandle } from '@/lib/linkedin'

export const MISSING_IDENTIFIER_ERROR = 'Add an email or a LinkedIn profile URL to identify this candidate.'

// Empty strings and legacy placeholder addresses are stored as null
export function realEmailOrNull(email: string | null | undefined): string | null {
  const v = email?.trim()
  if (!v || isPlaceholderEmail(v)) return null
  return v
}

// A candidate is identifiable by a real email or a LinkedIn URL that normalizes to a profile handle
export function hasCandidateIdentifier(email: string | null | undefined, linkedinUrl: string | null | undefined): boolean {
  return realEmailOrNull(email) != null || normalizeLinkedinHandle(linkedinUrl) != null
}

// Lowercase, accents removed, whitespace collapsed
export function normalizeFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return `${firstName ?? ''} ${lastName ?? ''}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

export function phoneDigits(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '')
  return d.length >= 7 ? d : null
}

// ─── Duplicate matching result (shared by API and UI) ─────────────────────────

export interface CandidateMatchPosition {
  candidatePositionId: string
  positionId: string
  title: string
  client: string
  stage: string
  status: string
}

export interface CandidateMatch {
  id: string
  firstName: string
  lastName: string
  email: string | null
  linkedinUrl: string | null
  phone: string | null
  country: string | null
  seniority: string | null
  positions: CandidateMatchPosition[]
  // set when a positionId was given and the candidate is already in that position
  inPosition: CandidateMatchPosition | null
}

export type DuplicateResult =
  | { kind: 'exact'; candidates: [CandidateMatch]; matchedBy: ('email' | 'linkedin')[] }
  | { kind: 'conflict'; candidates: [CandidateMatch, CandidateMatch] }
  | { kind: 'possible'; candidates: CandidateMatch[] }
  | { kind: 'none'; candidates: [] }

// Short human-readable stage/status for "already in this position" messages
export function describeInPosition(p: { stage: string; status: string }): string {
  const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')
  if (p.status === 'REJECTED') return `Rejected at ${label(p.stage)}`
  if (p.status === 'WITHDRAWN') return `Withdrawn at ${label(p.stage)}`
  if (p.status === 'HIRED' || p.stage === 'HIRED') return 'Hired'
  return `Active — ${label(p.stage)}`
}
