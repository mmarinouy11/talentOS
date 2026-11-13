import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { getOrComputeFitScore } from '@/lib/fit-scorer'

const MAX_IDS = 50
const DEFAULT_LIMIT = 15
const CONCURRENCY = 5

type Score = { candidateId: string; score: number; reason: string; cached: boolean }

function toScore(candidateId: string, r: { fitScore: number; fitSummary: string }, cached: boolean): Score {
  return { candidateId, score: Math.max(0, Math.min(100, Math.round(r.fitScore))), reason: r.fitSummary ?? '', cached }
}

// Real fit scores for Find Candidates, cost-capped. candidateIds arrive in prefilter order. Every candidate
// with a current cached score for this position is returned for free; real scoring (getOrComputeFitScore)
// runs only for the first `limit` uncached ones, 5 at a time. The rest come back in `pending`.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: positionId } = await params
  const position = await db.position.findFirst({ where: { id: positionId, deletedAt: null }, select: { id: true } })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.candidateIds)
    ? [...new Set((body.candidateIds as unknown[]).filter((x): x is string => typeof x === 'string'))].slice(0, MAX_IDS)
    : []
  const limit = Math.max(0, Math.min(DEFAULT_LIMIT, Number(body.limit ?? DEFAULT_LIMIT) || 0))

  const scores: Score[] = []
  const uncached: string[] = []
  await Promise.all(ids.map(async (id) => {
    const r = await getOrComputeFitScore(id, positionId, { cacheOnly: true }).catch(() => null)
    if (r) scores.push(toScore(id, r, true))
  }))
  const scoredIds = new Set(scores.map((s) => s.candidateId))
  for (const id of ids) if (!scoredIds.has(id)) uncached.push(id)

  const toCompute = uncached.slice(0, limit)
  const failed: string[] = []
  for (let i = 0; i < toCompute.length; i += CONCURRENCY) {
    await Promise.all(toCompute.slice(i, i + CONCURRENCY).map(async (id) => {
      try {
        const r = await getOrComputeFitScore(id, positionId)
        if (r) scores.push(toScore(id, r, false)); else failed.push(id)
      } catch (err) {
        console.error(`[talent-search] Scoring failed for candidate ${id}:`, err instanceof Error ? err.message : err)
        failed.push(id)
      }
    }))
  }

  return NextResponse.json({ scores, pending: uncached.slice(limit), failed })
}
