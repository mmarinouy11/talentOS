import { auth } from '@/lib/auth'
import { callClaudeJSON } from '@/lib/anthropic'
import { NextResponse } from 'next/server'

interface CandidateParsed {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  country: string | null
  skills: string[]
  languages: string[]
  seniority: 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL'
  yearsOfExperience: number | null
  summary: string
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cvText } = await request.json()
  if (!cvText) return NextResponse.json({ error: 'cvText is required' }, { status: 400 })

  const result = await callClaudeJSON<CandidateParsed>(
    `Extract structured data from this CV:\n\n${cvText}`,
    'FAST',
    `You are a CV parser. Extract the following fields as JSON:
{
  "firstName": string,
  "lastName": string,
  "email": string,
  "phone": string | null,
  "country": string | null,
  "skills": string[],
  "languages": string[],
  "seniority": "JUNIOR" | "MID" | "SENIOR" | "STAFF" | "PRINCIPAL",
  "yearsOfExperience": number | null,
  "summary": string
}`,
  )

  return NextResponse.json(result)
}
