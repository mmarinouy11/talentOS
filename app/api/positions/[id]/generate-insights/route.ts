import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { callClaudeJSON } from '@/lib/anthropic'

const POSITION_INSIGHTS_SYSTEM_PROMPT = `You are a recruiting intelligence analyst. You'll receive feedback data from multiple candidate interviews for a single job position. Identify patterns across candidates — not just individual assessments — to help the team understand systemic issues with this position's pipeline.

Return ONLY valid JSON, no markdown:
{
  "summary": "2-4 sentences on what's happening overall",
  "commonStrengths": ["recurring positive patterns"],
  "commonConcerns": ["recurring gaps/issues — the most valuable signal for explaining low conversion"],
  "bottleneckStage": "which stage most often leads to rejection if a clear pattern exists across 2+ candidates, or null",
  "recommendation": "one concrete, actionable suggestion"
}
Rules:
- Only state patterns supportable from the data — don't invent trends from a single data point
- Be direct and specific, avoid generic advice
- May reference candidate counts (e.g. "3 of 5 candidates...")
- No markdown, no explanation, only the JSON object`

interface InsightsParse {
  summary: string
  commonStrengths: string[]
  commonConcerns: string[]
  bottleneckStage: string | null
  recommendation: string
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const position = await db.position.findFirst({ where: { id, deletedAt: null } })
  if (!position) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const candidatePositions = await db.candidatePosition.findMany({
    where: { positionId: id },
    include: {
      candidate: { select: { firstName: true, lastName: true } },
      interviews: {
        where: { feedbackSummary: { not: null } },
        select: {
          stage: true,
          roundLabel: true,
          feedbackSummary: true,
          feedbackStrengths: true,
          feedbackConcerns: true,
          decision: true,
          aiScore: true,
        },
      },
    },
  })

  const interviewsWithFeedback = candidatePositions.flatMap((cp) =>
    cp.interviews.map((iv) => ({ ...iv, candidateName: `${cp.candidate.firstName} ${cp.candidate.lastName}` }))
  )

  if (interviewsWithFeedback.length < 2) {
    return NextResponse.json({
      notEnoughData: true,
      message: 'Not enough feedback data yet to generate insights. At least 2 completed interviews with feedback are needed.',
    })
  }

  const prompt = `Position: "${position.title}" at "${position.client}"

Feedback from ${interviewsWithFeedback.length} completed interviews across ${candidatePositions.filter(cp => cp.interviews.length > 0).length} candidates:

${interviewsWithFeedback.map((iv, i) => `--- Interview ${i + 1}: ${iv.candidateName} — ${iv.roundLabel} (${iv.stage}) ---
Summary: ${iv.feedbackSummary}
Strengths: ${iv.feedbackStrengths.join(', ') || 'none listed'}
Concerns: ${iv.feedbackConcerns.join(', ') || 'none listed'}
Decision: ${iv.decision ?? 'not set'}${iv.aiScore != null ? ` (AI score: ${iv.aiScore}/5)` : ''}`).join('\n\n')}

Identify patterns across these candidates.`

  let parsed: InsightsParse
  try {
    parsed = await callClaudeJSON<InsightsParse>(prompt, 'SMART', POSITION_INSIGHTS_SYSTEM_PROMPT)
  } catch (err) {
    console.error('[generate-insights] Claude error:', err)
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
  }

  const updated = await db.position.update({
    where: { id },
    data: {
      insightsSummary: parsed.summary,
      insightsCommonStrengths: parsed.commonStrengths,
      insightsCommonConcerns: parsed.commonConcerns,
      insightsBottleneckStage: parsed.bottleneckStage ?? null,
      insightsRecommendation: parsed.recommendation,
      insightsGeneratedAt: new Date(),
    },
  })

  return NextResponse.json({
    summary: updated.insightsSummary,
    commonStrengths: updated.insightsCommonStrengths,
    commonConcerns: updated.insightsCommonConcerns,
    bottleneckStage: updated.insightsBottleneckStage,
    recommendation: updated.insightsRecommendation,
    generatedAt: updated.insightsGeneratedAt,
  })
}
