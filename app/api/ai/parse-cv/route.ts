import { auth } from '@/lib/auth'
import { getOpenAI } from '@/lib/openai'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cvText } = await request.json()
  if (!cvText) return NextResponse.json({ error: 'cvText is required' }, { status: 400 })

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a recruiting assistant. Extract structured data from the CV text below and return a JSON object with these fields:
firstName, lastName, email, phone, country, skills (string[]), languages (string[]),
seniority (JUNIOR|MID|SENIOR|STAFF|PRINCIPAL), yearsOfExperience (number),
currentCompensation (number|null), currentCurrency (string|null), currentEmploymentType (string|null),
summary (2-3 sentence professional summary), strengths (string[], max 5), risks (string[], max 5).`,
      },
      { role: 'user', content: cvText },
    ],
  })

  const parsed = JSON.parse(completion.choices[0].message.content ?? '{}')
  return NextResponse.json(parsed)
}
