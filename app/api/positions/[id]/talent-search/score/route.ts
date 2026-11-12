import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getOrComputeFitScore } from '@/lib/fit-scorer'

type CandidateInput = { id: string }

// The real fit score (cached per candidate/position/inputs), so Find Candidates shows the same number
// the candidate gets once added to the position. Redeployment candidates get no boost.
async function scoreOne(candidateId: string, positionId: string): Promise<{ candidateId: string; score: number; reason: string }> {
  try {
    const result = await getOrComputeFitScore(candidateId, positionId)
    return {
      candidateId,
      score: result ? Math.max(0, Math.min(100, Math.round(result.fitScore))) : 0,
      reason: result?.fitSummary ?? '',
    }
  } catch {
    return { candidateId, score: 0, reason: '' }
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: positionId } = await params

  const position = await db.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { id: true },
  })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  const body = await request.json()
  const candidates: CandidateInput[] = body.candidates ?? []

  // Real scoring is heavier than the old quick estimate: concurrency 5, cached results return instantly
  const CONCURRENCY = 5
  const results: { candidateId: string; score: number; reason: string }[] = []

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map((c) => scoreOne(c.id, positionId))
    )
    results.push(...batchResults)
  }

  return NextResponse.json({ scores: results })
}
