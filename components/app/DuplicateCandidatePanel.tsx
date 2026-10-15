'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { describeInPosition, type CandidateMatch, type DuplicateResult } from '@/lib/candidate-identifier'

function MatchCard({
  match,
  positionId,
  busy,
  onAddToPosition,
}: {
  match: CandidateMatch
  positionId?: string
  busy?: boolean
  onAddToPosition?: (m: CandidateMatch) => void
}) {
  const others = match.positions.filter((p) => p.positionId !== positionId)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{match.firstName} {match.lastName}</p>
          <p className="text-xs text-gray-500 truncate">{match.email ?? 'No email'}</p>
          {match.linkedinUrl && (
            <a href={match.linkedinUrl.startsWith('http') ? match.linkedinUrl : `https://${match.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-gray-500 truncate hover:underline">
              {match.linkedinUrl}
            </a>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {positionId && onAddToPosition && !match.inPosition && (
            <Button type="button" size="sm" disabled={busy} onClick={() => onAddToPosition(match)}>Add to this position</Button>
          )}
          <Link href={`/candidates/${match.id}`} target="_blank" rel="noopener noreferrer">
            <Button type="button" size="sm" variant="outline">Open profile</Button>
          </Link>
        </div>
      </div>
      {match.inPosition && (
        <p className="text-xs font-medium text-amber-700">Already in this position — {describeInPosition(match.inPosition)}</p>
      )}
      {others.length > 0 ? (
        <p className="text-xs text-gray-500">
          In: {others.map((p) => `${p.title} (${describeInPosition(p)})`).join(' · ')}
        </p>
      ) : !match.inPosition && <p className="text-xs text-gray-400">Not in any position</p>}
    </div>
  )
}

export function DuplicateCandidatePanel({
  duplicate,
  positionId,
  busy,
  onAddToPosition,
  onUseExisting,
  onCreateAnyway,
}: {
  duplicate: DuplicateResult
  positionId?: string
  busy?: boolean
  onAddToPosition?: (m: CandidateMatch) => void
  onUseExisting?: (m: CandidateMatch) => void
  onCreateAnyway?: () => void
}) {
  if (duplicate.kind === 'none') return null

  if (duplicate.kind === 'exact') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
        <p className="text-sm font-medium text-red-800">
          This candidate already exists (matched by {duplicate.matchedBy.map((m) => (m === 'email' ? 'email' : 'LinkedIn')).join(' and ')}). No new candidate was created.
        </p>
        <MatchCard match={duplicate.candidates[0]} positionId={positionId} busy={busy} onAddToPosition={onAddToPosition} />
      </div>
    )
  }

  if (duplicate.kind === 'conflict') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
        <p className="text-sm font-medium text-red-800">
          This email belongs to one candidate and this LinkedIn to another. They may be duplicates — review before continuing.
        </p>
        <p className="text-xs text-red-700">Email match:</p>
        <MatchCard match={duplicate.candidates[0]} positionId={positionId} />
        <p className="text-xs text-red-700">LinkedIn match:</p>
        <MatchCard match={duplicate.candidates[1]} positionId={positionId} />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <p className="text-sm font-medium text-amber-800">
        Similar candidate{duplicate.candidates.length !== 1 ? 's' : ''} found (same name and {duplicate.candidates.some((c) => c.phone) ? 'phone or country' : 'country'}). Check before creating a new one.
      </p>
      {duplicate.candidates.map((m) => (
        <div key={m.id} className="space-y-1">
          <MatchCard match={m} positionId={positionId} />
          {onUseExisting && !m.inPosition && (
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onUseExisting(m)}>
                Use existing{positionId ? ' — add to this position' : ''}
              </Button>
            </div>
          )}
        </div>
      ))}
      {onCreateAnyway && (
        <div className="flex justify-end pt-1">
          <Button type="button" size="sm" disabled={busy} onClick={onCreateAnyway}>Create anyway</Button>
        </div>
      )}
    </div>
  )
}
