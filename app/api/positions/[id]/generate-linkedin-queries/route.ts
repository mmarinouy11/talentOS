import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { callClaudeJSON, anthropicErrorResponse } from '@/lib/anthropic'

const LINKEDIN_QUERY_PROMPT = `Given a job position's required skills, seniority level, and location requirements, generate 2-3 LinkedIn X-ray search query strings a recruiter could paste into Google or LinkedIn search to find matching candidate profiles.

Use standard X-ray syntax, e.g.:
site:linkedin.com/in/ ("Java" OR "Spring Boot") AND "AWS" AND ("Senior" OR "Staff")

Return ONLY a JSON array of strings, no markdown:
["query 1", "query 2", "query 3"]

Rules:
- OR for synonym/equivalent skills, AND between distinct required skill groups
- Include seniority terms if specified
- Keep queries concise, 1-2 lines each
- No markdown, no explanation, only the JSON array`

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const position = await db.position.findFirst({ where: { id, deletedAt: null } })
  if (!position) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const prompt = `Skills: ${position.jdSkills.join(', ') || 'not specified'}
Seniority: ${position.jdSeniority ?? 'not specified'}
Location: ${position.location.join(', ') || 'not specified'}`

  let queries: string[]
  try {
    queries = await callClaudeJSON<string[]>(prompt, 'FAST', LINKEDIN_QUERY_PROMPT)
    if (!Array.isArray(queries)) queries = []
  } catch (err) {
    console.error('[generate-linkedin-queries] Claude error:', err)
    return anthropicErrorResponse(err) ?? NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }

  await db.position.update({
    where: { id },
    data: { linkedinSearchQueries: queries },
  })

  return NextResponse.json({ queries })
}
