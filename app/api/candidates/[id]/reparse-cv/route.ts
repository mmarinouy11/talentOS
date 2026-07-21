import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { extractPdfText, renderPdfToImages } from '@/lib/pdf-extract'
import { uploadFileToDrive } from '@/lib/google'
import { callClaudeJSON, getAnthropic, MODELS, anthropicErrorResponse } from '@/lib/anthropic'

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

  // Step 1: Try text extraction
  let text = ''
  try {
    text = await extractPdfText(buffer)
  } catch (err) {
    console.warn('[reparse-cv] Text extraction failed, will try vision fallback:', err)
  }

  const MIN_TEXT_LENGTH = 100
  const useVision = text.trim().length < MIN_TEXT_LENGTH

  // Step 2: Vision fallback for image-based PDFs
  if (useVision) {
    console.log(`[reparse-cv] Text too short (${text.trim().length} chars) — using vision fallback`)
    let pageImages: Buffer[]
    try {
      pageImages = await renderPdfToImages(buffer, 6)
    } catch (err) {
      console.error('[reparse-cv] Vision render failed:', err)
      return NextResponse.json({ error: 'Could not extract text from this PDF. Ensure it is a valid PDF or try a text-based PDF.' }, { status: 422 })
    }
    if (pageImages.length === 0) {
      return NextResponse.json({ error: 'Could not render PDF pages for extraction.' }, { status: 422 })
    }

    // Use vision model to extract CV text
    const anthropic = getAnthropic()
    const imageBlocks = pageImages.map((buf) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/png' as const, data: buf.toString('base64') },
    }))
    try {
      const response = await anthropic.messages.create({
        model: MODELS.SMART,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: 'Parse this CV from the images and return the structured JSON.' }],
        }],
      })
      const block = response.content[0]
      if (block.type !== 'text') throw new Error('Unexpected vision response type')
      const clean = block.text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      const visionParsed = JSON.parse(clean)

      // Upload to Drive (non-fatal)
      let cvDriveId: string | null = null
      let cvOriginalName: string | null = file.name
      try {
        const { fileId, fileName } = await uploadFileToDrive(buffer, `${Date.now()}_${file.name}`, file.type, process.env.GOOGLE_DRIVE_FOLDER_ID!)
        cvDriveId = fileId
        cvOriginalName = fileName
      } catch (err) {
        console.error('[reparse-cv] Drive upload failed (non-fatal):', err)
      }

      const candidate = await db.candidate.update({
        where: { id },
        data: {
          ...(visionParsed.firstName ? { firstName: visionParsed.firstName } : {}),
          ...(visionParsed.lastName ? { lastName: visionParsed.lastName } : {}),
          ...(visionParsed.phone !== undefined ? { phone: visionParsed.phone } : {}),
          ...(visionParsed.country !== undefined ? { country: visionParsed.country } : {}),
          ...(visionParsed.seniority ? { seniority: visionParsed.seniority } : {}),
          ...(visionParsed.yearsOfExperience !== undefined ? { yearsOfExperience: visionParsed.yearsOfExperience } : {}),
          skills: visionParsed.skills ?? [],
          languages: visionParsed.languages ?? [],
          summary: visionParsed.summary ?? null,
          strengths: visionParsed.strengths ?? [],
          risks: visionParsed.risks ?? [],
          ...(visionParsed.currentCompensation !== undefined ? { currentCompensation: visionParsed.currentCompensation } : {}),
          cvDriveId,
          cvOriginalName,
        },
      })
      return NextResponse.json({ candidate, parsed: visionParsed })
    } catch (err) {
      console.error('[reparse-cv] Vision parsing failed:', err)
      return anthropicErrorResponse(err) ?? NextResponse.json({ error: 'Could not parse this PDF. The file may be corrupt or unreadable.' }, { status: 422 })
    }
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

  // Parse with Claude (text path)
  let parsed: {
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
  }
  try {
    parsed = await callClaudeJSON<typeof parsed>(
      `Parse this CV and return the structured JSON:\n\n${text.slice(0, 8000)}`,
      'FAST',
      SYSTEM_PROMPT
    )
  } catch (err) {
    console.error('[reparse-cv] Claude text parsing failed:', err)
    return anthropicErrorResponse(err) ?? NextResponse.json({ error: 'Failed to parse CV' }, { status: 500 })
  }
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
