import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { callClaudeJSON } from '@/lib/anthropic'

const GLOBAL_INSIGHTS_SYSTEM_PROMPT = `You are a recruiting intelligence analyst. You'll receive feedback data from interviews across multiple positions and clients. Identify systemic patterns — skill gaps, recurring bottlenecks, cross-position trends — to help the team understand what's driving or limiting pipeline conversion org-wide.

Return ONLY valid JSON, no markdown:
{
  "summary": "2-4 sentences on org-wide patterns",
  "commonStrengths": ["recurring positive patterns across candidates"],
  "commonConcerns": ["recurring gaps or issues — cross-position patterns are most valuable"],
  "bottleneckPattern": "which stage or pattern causes most rejections org-wide, or null if no clear pattern",
  "recommendation": "one concrete, actionable suggestion for the recruiting team"
}
Rules:
- Cross-position patterns (e.g. "AWS gaps appear across 3 positions for Client X") are more valuable than position-specific observations
- Only state patterns supportable from the data — don't invent trends from a single data point
- Be direct and specific, avoid generic advice
- May reference counts (e.g. "5 of 9 candidates...")
- No markdown, no explanation, only the JSON object`

interface GlobalInsightsParse {
  summary: string
  commonStrengths: string[]
  commonConcerns: string[]
  bottleneckPattern: string | null
  recommendation: string
}

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const interviews = await db.interview.findMany({
    where: { feedbackSummary: { not: null } },
    select: {
      stage: true,
      roundLabel: true,
      feedbackSummary: true,
      feedbackStrengths: true,
      feedbackConcerns: true,
      decision: true,
      aiRecommendedDecision: true,
      candidatePosition: {
        select: {
          candidate: { select: { firstName: true, lastName: true } },
          position: { select: { title: true, client: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (interviews.length < 5) {
    return NextResponse.json({
      notEnoughData: true,
      message: `Not enough feedback data yet to generate global insights. At least 5 completed interviews with feedback are needed (currently ${interviews.length}).`,
    })
  }

  const prompt = `Org-wide interview feedback — ${interviews.length} completed interviews across ${new Set(interviews.map(iv => iv.candidatePosition.position.title + '|' + iv.candidatePosition.position.client)).size} unique positions:

${interviews.map((iv, i) => `--- Interview ${i + 1}: ${iv.candidatePosition.candidate.firstName} ${iv.candidatePosition.candidate.lastName} — ${iv.roundLabel} (${iv.stage}) — Position: "${iv.candidatePosition.position.title}" at "${iv.candidatePosition.position.client}" ---
Summary: ${iv.feedbackSummary}
Strengths: ${iv.feedbackStrengths.join(', ') || 'none listed'}
Concerns: ${iv.feedbackConcerns.join(', ') || 'none listed'}
Decision: ${iv.decision ?? iv.aiRecommendedDecision ?? 'not set'}`).join('\n\n')}

Identify systemic cross-position patterns.`

  let parsed: GlobalInsightsParse
  try {
    parsed = await callClaudeJSON<GlobalInsightsParse>(prompt, 'SMART', GLOBAL_INSIGHTS_SYSTEM_PROMPT)
  } catch (err) {
    console.error('[generate-global-insights] Claude error:', err)
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
  }

  // Keep only one global insights row
  await db.globalInsights.deleteMany({})
  const saved = await db.globalInsights.create({
    data: {
      summary: parsed.summary,
      commonStrengths: parsed.commonStrengths,
      commonConcerns: parsed.commonConcerns,
      bottleneckPattern: parsed.bottleneckPattern ?? null,
      recommendation: parsed.recommendation,
    },
  })

  return NextResponse.json(saved)
}
