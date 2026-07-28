import { extractPdfText, renderPdfToImages } from '@/lib/pdf-extract'
import { callClaudeJSON, getAnthropic, MODELS } from '@/lib/anthropic'

export const CV_PARSE_SYSTEM_PROMPT = `You are a CV parser. Extract structured information from the CV text provided.
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
  "currentCompensation": number or null,
  "experience": array of objects with shape { "title": string, "company": string, "startDate": string, "endDate": string, "bullets": string[] } — one entry per job, bullets are key achievements/responsibilities (2-4 per role), dates like "Jan 2021" or "2019",
  "education": array of objects with shape { "degree": string, "institution": string, "year": string or null } — one entry per qualification
}
Rules:
- Skills should be specific technologies, not soft skills
- Seniority: 0-2 years = JUNIOR, 2-5 = MID, 5-8 = SENIOR, 8-12 = STAFF, 12+ = PRINCIPAL
- Return null for fields you cannot determine, never guess email or phone
- languages must only contain human spoken languages, never programming languages
- strengths: 2-4 notable positives visible from the CV
- risks: 1-3 potential concerns visible from the CV (gaps, short tenures, etc.)
- currentCompensation: monthly USD amount if stated, else null
- "experience" and "education" must be arrays (empty array [] if not found)
- No markdown, no explanation, only the JSON object`

export interface ParsedCv {
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
  experience: { title: string; company: string; startDate: string; endDate: string; bullets: string[] }[]
  education: { degree: string; institution: string; year?: string }[]
}

const MIN_TEXT_LENGTH = 100

function isGlyphGarbage(text: string): boolean {
  const tokens = text.trim().split(/\s+/)
  if (tokens.length < 20) return false
  return tokens.filter((t) => t.length <= 1).length / tokens.length > 0.6
}

export async function parseCvFromBuffer(buffer: Buffer): Promise<ParsedCv> {
  let text = ''
  try {
    text = await extractPdfText(buffer)
  } catch {
    // fall through to vision
  }

  const useVision = text.trim().length < MIN_TEXT_LENGTH || isGlyphGarbage(text)

  if (useVision) {
    const pageImages = await renderPdfToImages(buffer, 6)
    if (pageImages.length === 0) throw new Error('Could not render PDF pages for extraction.')

    const anthropic = getAnthropic()
    const imageBlocks = pageImages.map((buf) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/png' as const, data: buf.toString('base64') },
    }))

    const response = await anthropic.messages.create({
      model: MODELS.SMART,
      max_tokens: 4096,
      system: CV_PARSE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: 'Parse this CV from the images and return the structured JSON.' }],
      }],
    })
    const block = response.content[0]
    if (block.type !== 'text') throw new Error('Unexpected vision response type')
    const clean = block.text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    return JSON.parse(clean) as ParsedCv
  }

  return callClaudeJSON<ParsedCv>(
    `Parse this CV and return the structured JSON:\n\n${text.slice(0, 8000)}`,
    'FAST',
    CV_PARSE_SYSTEM_PROMPT
  )
}
