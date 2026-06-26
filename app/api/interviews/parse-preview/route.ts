import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { parseTextFeedback } from '@/lib/feedback-parser'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await request.json().catch(() => ({}))
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  try {
    const result = await parseTextFeedback(text)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Parse failed' }, { status: 500 })
  }
}
