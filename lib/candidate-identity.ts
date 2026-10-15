import { db } from '@/lib/db'
import { normalizeLinkedinHandle } from '@/lib/linkedin'
import {
  normalizeFullName, phoneDigits, realEmailOrNull,
  type CandidateMatch, type DuplicateResult,
} from '@/lib/candidate-identifier'

export * from '@/lib/candidate-identifier'

export interface MatchInput {
  email?: string | null
  linkedinUrl?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  country?: string | null
}

const MATCH_SELECT = {
  id: true, firstName: true, lastName: true, email: true, linkedinUrl: true,
  phone: true, country: true, seniority: true,
  candidatePositions: {
    select: {
      id: true, positionId: true, stage: true, status: true,
      position: { select: { title: true, client: true, deletedAt: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const

type MatchRow = {
  id: string; firstName: string; lastName: string; email: string | null; linkedinUrl: string | null
  phone: string | null; country: string | null; seniority: string | null
  candidatePositions: { id: string; positionId: string; stage: string; status: string; position: { title: string; client: string; deletedAt: Date | null } }[]
}

function toMatch(row: MatchRow, positionId?: string | null): CandidateMatch {
  const positions = row.candidatePositions
    .filter((cp) => !cp.position.deletedAt)
    .map((cp) => ({
      candidatePositionId: cp.id, positionId: cp.positionId,
      title: cp.position.title, client: cp.position.client, stage: cp.stage, status: cp.status,
    }))
  return {
    id: row.id, firstName: row.firstName, lastName: row.lastName, email: row.email,
    linkedinUrl: row.linkedinUrl, phone: row.phone, country: row.country, seniority: row.seniority,
    positions,
    inPosition: positionId ? positions.find((p) => p.positionId === positionId) ?? null : null,
  }
}

/**
 * Find existing (non-deleted) candidates matching the given identity:
 * - exact: same email (case-insensitive) or same LinkedIn handle
 * - conflict: the email belongs to one candidate and the LinkedIn handle to another
 * - possible: no exact match, same normalized full name AND (same phone digits OR same country)
 */
export async function findCandidateMatches(
  input: MatchInput,
  opts: { excludeId?: string; positionId?: string | null } = {},
): Promise<DuplicateResult> {
  const email = realEmailOrNull(input.email)
  const handle = normalizeLinkedinHandle(input.linkedinUrl)
  const notSelf = opts.excludeId ? { id: { not: opts.excludeId } } : {}

  const [byEmail, byHandle] = await Promise.all([
    email
      ? db.candidate.findFirst({ where: { deletedAt: null, email: { equals: email, mode: 'insensitive' }, ...notSelf }, select: MATCH_SELECT })
      : null,
    handle
      ? db.candidate.findFirst({ where: { deletedAt: null, linkedinHandle: handle, ...notSelf }, select: MATCH_SELECT })
      : null,
  ])

  if (byEmail && byHandle && byEmail.id !== byHandle.id) {
    return { kind: 'conflict', candidates: [toMatch(byEmail, opts.positionId), toMatch(byHandle, opts.positionId)] }
  }
  const exact = byEmail ?? byHandle
  if (exact) {
    const matchedBy: ('email' | 'linkedin')[] = []
    if (byEmail) matchedBy.push('email')
    if (byHandle) matchedBy.push('linkedin')
    return { kind: 'exact', candidates: [toMatch(exact, opts.positionId)], matchedBy }
  }

  const name = normalizeFullName(input.firstName, input.lastName)
  const phone = phoneDigits(input.phone)
  const country = input.country?.trim().toLowerCase() || null
  if (!name || (!phone && !country)) return { kind: 'none', candidates: [] }

  // Accent-insensitive name match done in SQL so it scales with the candidate table
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Candidate"
    WHERE "deletedAt" IS NULL
      AND regexp_replace(
            translate(lower("firstName" || ' ' || "lastName"),
              'áàâãäåéèêëíìîïóòôõöúùûüçñý', 'aaaaaaeeeeiiiiooooouuuucny'),
            '\\s+', ' ', 'g') = ${name}
    LIMIT 50
  `
  const candidateIds = ids.map((r) => r.id).filter((id) => id !== opts.excludeId)
  if (candidateIds.length === 0) return { kind: 'none', candidates: [] }

  const rows = await db.candidate.findMany({ where: { id: { in: candidateIds } }, select: MATCH_SELECT })
  const possible = rows.filter((r) => {
    if (normalizeFullName(r.firstName, r.lastName) !== name) return false
    const samePhone = phone != null && phoneDigits(r.phone) === phone
    const sameCountry = country != null && r.country?.trim().toLowerCase() === country
    return samePhone || sameCountry
  })
  if (possible.length === 0) return { kind: 'none', candidates: [] }
  return { kind: 'possible', candidates: possible.map((r) => toMatch(r, opts.positionId)) }
}
