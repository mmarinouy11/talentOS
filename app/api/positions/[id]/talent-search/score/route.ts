import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { callClaudeJSON } from '@/lib/anthropic'

const SCORE_SYSTEM = 'You are a talent fit evaluator. Score candidates concisely.'

type CandidateInput = {
  id: string
  skills: string[]
  seniority: string | null
  yearsOfExperience: number | null
}

type ScoreResult = {
  score: number
  reason: string
}

async function scoreOne(
  candidate: CandidateInput,
  jdSkills: string[],
  coreSkills: string[]
): Promise<{ candidateId: string; score: number; reason: string }> {
  const prompt = `Score this candidate's fit for the role on a scale of 0-100.
Return ONLY a JSON object: {"score": N, "reason": "one sentence"}
Role requires: ${jdSkills.slice(0, 10).join(', ')}
Core requirements: ${coreSkills.join(', ')}
Candidate skills: ${candidate.skills.join(', ')}
Seniority: ${candidate.seniority ?? 'unknown'}, Experience: ${candidate.yearsOfExperience ?? '?'} years`

  try {
    const result = await callClaudeJSON<ScoreResult>(prompt, 'FAST', SCORE_SYSTEM)
    return {
      candidateId: candidate.id,
      score: Math.max(0, Math.min(100, Math.round(result.score ?? 0))),
      reason: result.reason ?? '',
    }
  } catch {
    return { candidateId: candidate.id, score: 0, reason: '' }
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
    select: { jdSkills: true, coreSkills: true },
  })
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 })

  const body = await request.json()
  const candidates: CandidateInput[] = body.candidates ?? []

  // Run with concurrency limit of 10
  const CONCURRENCY = 10
  const results: { candidateId: string; score: number; reason: string }[] = []

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map((c) => scoreOne(c, position.jdSkills, position.coreSkills))
    )
    results.push(...batchResults)
  }

  return NextResponse.json({ scores: results })
}
