import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { uploadFileToDrive } from '@/lib/google'
import { callClaudeJSON } from '@/lib/anthropic'
import { extractPdfText } from '@/lib/pdf-extract'

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
  "languages": array of strings — SPOKEN/WRITTEN human languages only (e.g. "English", "Spanish", "Portuguese"). NOT programming languages. Infer from CV content, education, or location if not explicitly stated,
  "summary": string or null
}
Rules:
- Skills should be specific technologies, not soft skills
- Seniority: 0-2 years = JUNIOR, 2-5 = MID, 5-8 = SENIOR, 8-12 = STAFF, 12+ = PRINCIPAL
- Return null for fields you cannot determine, never guess email or phone
- "languages" must only contain human spoken languages, never programming languages or frameworks
- No markdown, no explanation, only the JSON object`

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const mimeType = file.type
    const originalName = file.name

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json({ error: 'Only PDF and DOCX files are supported' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Extract text
    let text = ''
    if (mimeType === 'application/pdf') {
      text = await extractPdfText(buffer)
    } else {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 422 })
    }

    // Upload to Google Drive (non-fatal if it fails)
    const timestamp = Date.now()
    const driveFileName = `${timestamp}_${originalName}`
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!

    let driveFileId = ''
    let driveFileName2 = driveFileName
    try {
      const { fileId, fileName: savedName } = await uploadFileToDrive(buffer, driveFileName, mimeType, folderId)
      driveFileId = fileId
      driveFileName2 = savedName
    } catch (driveError) {
      console.error('Drive upload failed (non-fatal):', driveError)
      // continue — CV parsing works independently of Drive
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
    }>(
      `Parse this CV and return the structured JSON:\n\n${text.slice(0, 8000)}`,
      'FAST',
      SYSTEM_PROMPT
    )

    return NextResponse.json({
      driveFileId,
      driveFileName: driveFileName2,
      parsed,
    })
  } catch (err) {
    console.error('CV upload error:', err)
    return NextResponse.json({ error: 'Failed to process CV' }, { status: 500 })
  }
}
