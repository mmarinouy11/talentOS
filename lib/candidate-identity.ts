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
