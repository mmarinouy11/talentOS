import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { extractPdfText } from '@/lib/pdf-extract'
import { uploadFileToDrive } from '@/lib/google'
import { callClaudeJSON } from '@/lib/anthropic'

const SYSTEM_PROMPT = `You are a CV parser. Extract structured information from the CV text provided.
Return ONLY valid JSON with these exact fields:
{
  "firstName": string or null,
  "lastName": string or null,
  "email": string or null,
  "phone": string or null,
  "country": string or null,
  "linkedinUrl": string or null,
  "seniority": one of "JUNIOR"|"MID"|"SENIOR"|"STAFF"|"PRINCIPAL" or null,
  "yearsOfExperience": number or null,
  "skills": array of strings,
  "languages": array of strings — spoken/written human languages only,
  "summary": string or null,
  "strengths": array of strings,
  "risks": array of strings,
  "currentCompensation": number or null
}
Rules:
- Skills should be specific technologies, not soft skills
- Seniority: 0-2 years = JUNIOR, 2-5 = MID, 5-8 = SENIOR, 8-12 = STAFF, 12+ = PRINCIPAL
- Return null for fields you cannot determine, never guess email or phone
- languages must only contain human spoken languages, never programming languages
- strengths: 2-4 notable positives visible from the CV
- risks: 1-3 potential concerns visible from the CV (gaps, short tenures, etc.)
- currentCompensation: monthly USD amount if stated, else null
- No markdown, no explanation, only the JSON object`

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.candidate.findFirst({ where: { id, deletedAt: null } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Extract text
  let text = ''
  try {
    text = await extractPdfText(buffer)
  } catch {
    return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 422 })
  }

  if (!text.trim()) {
    return NextResponse.json({ error: 'Could not extract text from this PDF' }, { status: 422 })
  }

  // Upload to Drive (non-fatal)
  let cvDriveId: string | null = null
  let cvOriginalName: string | null = file.name
  try {
    const { fileId, fileName } = await uploadFileToDrive(
      buffer,
      `${Date.now()}_${file.name}`,
      file.type,
      process.env.GOOGLE_DRIVE_FOLDER_ID!
    )
    cvDriveId = fileId
    cvOriginalName = fileName
  } catch (err) {
    console.error('[reparse-cv] Drive upload failed (non-fatal):', err)
  }

  // Parse with Claude Haiku
  const parsed = await callClaudeJSON<{
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    country: string | null
    linkedinUrl: string | null
    seniority: 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL' | null
    yearsOfExperience: number | null
    skills: string[]
    languages: string[]
    summary: string | null
    strengths: string[]
    risks: string[]
    currentCompensation: number | null
  }>(
    `Parse this CV and return the structured JSON:\n\n${text.slice(0, 8000)}`,
    'FAST',
    SYSTEM_PROMPT
  )

  // Update candidate with all parsed fields
  const candidate = await db.candidate.update({
    where: { id },
    data: {
      ...(parsed.firstName ? { firstName: parsed.firstName } : {}),
      ...(parsed.lastName ? { lastName: parsed.lastName } : {}),
      ...(parsed.phone !== undefined ? { phone: parsed.phone } : {}),
      ...(parsed.country !== undefined ? { country: parsed.country } : {}),
      ...(parsed.seniority ? { seniority: parsed.seniority } : {}),
      ...(parsed.yearsOfExperience !== undefined ? { yearsOfExperience: parsed.yearsOfExperience } : {}),
      skills: parsed.skills ?? [],
      languages: parsed.languages ?? [],
      summary: parsed.summary ?? null,
      strengths: parsed.strengths ?? [],
      risks: parsed.risks ?? [],
      ...(parsed.currentCompensation !== undefined ? { currentCompensation: parsed.currentCompensation } : {}),
      cvDriveId,
      cvOriginalName,
    },
  })

  return NextResponse.json({ candidate, parsed })
}
