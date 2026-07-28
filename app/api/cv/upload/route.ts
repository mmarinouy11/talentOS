import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { uploadFileToDrive } from '@/lib/google'
import { callClaudeJSON, getAnthropic, MODELS, anthropicErrorResponse } from '@/lib/anthropic'
import { extractPdfText, renderPdfToImages } from '@/lib/pdf-extract'

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
  "summary": string or null,
  "experience": array of objects with shape { "title": string, "company": string, "startDate": string, "endDate": string, "bullets": string[] } — one entry per job, bullets are key achievements/responsibilities (2-4 per role), dates like "Jan 2021" or "2019",
  "education": array of objects with shape { "degree": string, "institution": string, "year": string or null } — one entry per qualification
}
Rules:
- Skills should be specific technologies, not soft skills
- Seniority: 0-2 years = JUNIOR, 2-5 = MID, 5-8 = SENIOR, 8-12 = STAFF, 12+ = PRINCIPAL
- Return null for fields you cannot determine, never guess email or phone
- "languages" must only contain human spoken languages, never programming languages or frameworks
- "experience" and "education" must be arrays (empty array [] if not found)
- No markdown, no explanation, only the JSON object`

type ParsedCV = {
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
  experience: { title: string; company: string; startDate: string; endDate: string; bullets: string[] }[]
  education: { degree: string; institution: string; year?: string }[]
}

// Detects Type3/custom-glyph garbage: >60% of whitespace tokens are single chars
function isGlyphGarbage(text: string): boolean {
  const tokens = text.trim().split(/\s+/)
  if (tokens.length < 20) return false
  const singleCharCount = tokens.filter((t) => t.length <= 1).length
  return singleCharCount / tokens.length > 0.6
}

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

    console.log('[cv-upload] Extracted text length:', text.length)
    console.log('[cv-upload] Extracted text preview:', text.substring(0, 200))
    if (text.length < 100) {
      console.warn('[cv-upload] WARNING: Very short text extracted — may be image-based PDF or extraction failed')
    }

    const garbage = isGlyphGarbage(text)
    const useVision = mimeType === 'application/pdf' && (text.trim().length < 100 || garbage)

    if (garbage) {
      console.warn('[cv-upload] WARNING: Glyph garbage detected (Type3/custom-font PDF) — falling back to vision')
    }

    if (!useVision && !text.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 422 })
    }

    // Upload to Google Drive (non-fatal)
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
      console.error('[cv-upload] Drive upload failed (non-fatal):', driveError)
    }

    // Vision path: image-based or glyph-garbage PDFs
    if (useVision) {
      console.log('[cv-upload] Using vision fallback')
      let pageImages: Buffer[]
      try {
        pageImages = await renderPdfToImages(buffer, 6)
      } catch (err) {
        console.error('[cv-upload] Vision render failed:', err)
        return NextResponse.json({ error: 'Could not extract text from this PDF. Try a text-based PDF.' }, { status: 422 })
      }
      if (pageImages.length === 0) {
        return NextResponse.json({ error: 'Could not render PDF pages for extraction.' }, { status: 422 })
      }

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
        const parsed: ParsedCV = JSON.parse(clean)
        console.log('[cv-upload] Vision parsed result:', JSON.stringify(parsed))
        return NextResponse.json({ driveFileId, driveFileName: driveFileName2, parsed })
      } catch (err) {
        console.error('[cv-upload] Vision parsing failed:', err)
        return anthropicErrorResponse(err) ?? NextResponse.json({ error: 'Could not parse this PDF. The file may be corrupt or unreadable.' }, { status: 422 })
      }
    }

    // Text path
    const parsed = await callClaudeJSON<ParsedCV>(
      `Parse this CV and return the structured JSON:\n\n${text.slice(0, 8000)}`,
      'FAST',
      SYSTEM_PROMPT
    )

    console.log('[cv-upload] Claude parsed result:', JSON.stringify(parsed))

    return NextResponse.json({ driveFileId, driveFileName: driveFileName2, parsed })
  } catch (err) {
    console.error('[cv-upload] Error:', err)
    return anthropicErrorResponse(err) ?? NextResponse.json({ error: 'Failed to process CV' }, { status: 500 })
  }
}
