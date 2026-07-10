import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { callClaudeJSON } from '@/lib/anthropic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const position = await db.position.findFirst({ where: { id, deletedAt: null } })
  if (!position) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!position.description) {
    return NextResponse.json({ error: 'No job description to generate questions from.' }, { status: 422 })
  }

  const prompt = `Based on the following job description, generate exactly 3 short screening questions to quickly assess if a candidate is a good fit. Questions should be direct and answerable in 1-2 sentences.

Return ONLY a JSON array of 3 strings, no other text:
["Question 1?", "Question 2?", "Question 3?"]

Job description:
${position.description.slice(0, 4000)}`

  let screeningQuestions: string[]
  try {
    const raw = await callClaudeJSON<string[]>(prompt, 'FAST')
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: 'Failed to generate questions.' }, { status: 500 })
    }
    screeningQuestions = raw.slice(0, 3).map(String)
  } catch {
    return NextResponse.json({ error: 'AI generation failed.' }, { status: 500 })
  }

  const updated = await db.position.update({
    where: { id },
    data: { screeningQuestions },
  })

  return NextResponse.json({ screeningQuestions: updated.screeningQuestions })
}
