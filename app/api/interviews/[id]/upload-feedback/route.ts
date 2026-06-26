import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { extractPdfText } from '@/lib/pdf-extract'
import { uploadFileToDrive } from '@/lib/google'
import { callClaudeJSON, getAnthropic, MODELS } from '@/lib/anthropic'
import { parseTextFeedback } from '@/lib/feedback-parser'

const execFileAsync = promisify(execFile)

const MIN_TEXT_LENGTH = 200
const MAX_VISION_PAGES = 12

const VISION_FEEDBACK_SYSTEM_PROMPT = `You are analyzing interview feedback report pages (provided as images) for a recruiting platform. Pages may include score visualizations, skill ratings, sentiment charts, and written interviewer comments. Read all visual content across all images as a single combined report.

Extract structured information and return ONLY valid JSON, no markdown:
{
  "summary": "2-3 sentence overall assessment",
  "strengths": ["3-5 specific positive points"],
  "concerns": ["2-4 specific concerns, empty array if none"],
  "score": number from 1 to 5 — assessment of how strong a fit this candidate is:
    1 = Poor fit, clear concerns outweigh strengths
    2 = Below average, more concerns than strengths
    3 = Average/mixed, balanced strengths and concerns
    4 = Strong fit, clear strengths with minor concerns
    5 = Excellent fit, overwhelmingly positive feedback
}
Rules:
- Read scores, star ratings, percentage bars, and badges visually
- Prioritize the interviewer's written remarks if present
- score must be an integer 1-5
- May be in English or Spanish
- No markdown, no explanation, only the JSON object`

interface FeedbackParse {
  summary: string
  strengths: string[]
  concerns: string[]
  score: number
}

async function renderPdfPages(buffer: Buffer): Promise<Buffer[]> {
  const workDir = await mkdtemp(join(tmpdir(), 'pdf-render-'))
  const inputPath = join(workDir, 'input.pdf')
  const outputPrefix = join(workDir, 'page')
  try {
    await writeFile(inputPath, buffer)
    await execFileAsync('pdftoppm', [
      '-png', '-r', '150', '-f', '1', '-l', String(MAX_VISION_PAGES),
      inputPath, outputPrefix,
    ])
    const files = (await readdir(workDir))
      .filter((f) => f.startsWith('page') && f.endsWith('.png'))
      .sort()
    if (files.length > MAX_VISION_PAGES) {
      console.warn(`[upload-feedback] PDF has more than ${MAX_VISION_PAGES} pages — only first ${MAX_VISION_PAGES} sent to vision model`)
    }
    return await Promise.all(files.map((f) => readFile(join(workDir, f))))
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function parseVisionFeedback(pageImages: Buffer[]): Promise<FeedbackParse> {
  const anthropic = getAnthropic()
  const imageBlocks = pageImages.map((buf) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/png' as const, data: buf.toString('base64') },
  }))
  const response = await anthropic.messages.create({
    model: MODELS.SMART,
    max_tokens: 2048,
    system: VISION_FEEDBACK_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [...imageBlocks, { type: 'text', text: 'Parse this interview feedback report and return the JSON.' }],
    }],
  })
  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from vision model')
  const clean = block.text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  return JSON.parse(clean) as FeedbackParse
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const interview = await db.interview.findUnique({ where: { id } })
    if (!interview) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (buffer.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
    }

    // Step 1: Try text extraction
    let rawText = ''
    try {
      rawText = await extractPdfText(buffer)
    } catch (err) {
      console.warn('[upload-feedback] Text extraction failed, will try vision fallback:', err)
    }

    const useVision = rawText.trim().length < MIN_TEXT_LENGTH

    // Step 2: Upload to Drive (regardless of parse path)
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!
    const fileName = `feedback_${id}_${Date.now()}.pdf`
    let fileId: string
    try {
      const result = await uploadFileToDrive(buffer, fileName, 'application/pdf', folderId)
      fileId = result.fileId
    } catch (err) {
      console.error('[upload-feedback] Drive upload error:', err)
      return NextResponse.json({ error: `Drive upload failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
    }

    // Step 3: Parse feedback
    let parsed: FeedbackParse
    let parseMethod: string

    if (useVision) {
      console.log(`[upload-feedback] Text too short (${rawText.trim().length} chars) — using vision fallback`)
      let pageImages: Buffer[]
      try {
        pageImages = await renderPdfPages(buffer)
      } catch (err) {
        console.error('[upload-feedback] PDF rendering error:', err)
        return NextResponse.json({ error: `PDF rendering failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 422 })
      }
      try {
        parsed = await parseVisionFeedback(pageImages)
        parseMethod = 'vision'
      } catch (err) {
        console.error('[upload-feedback] Vision parsing error:', err)
        return NextResponse.json({ error: `AI vision parsing failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
      }
    } else {
      try {
        parsed = await parseTextFeedback(rawText)
        parseMethod = 'text'
      } catch (err) {
        console.error('[upload-feedback] Claude text parsing error:', err)
        return NextResponse.json({ error: `AI parsing failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
      }
    }

    const updated = await db.interview.update({
      where: { id },
      data: {
        feedbackPdfUrl: fileId,
        feedbackText: rawText || '[Parsed from images — no embedded text]',
        feedbackSummary: parsed.summary,
        feedbackStrengths: parsed.strengths,
        feedbackConcerns: parsed.concerns,
        aiScore: typeof parsed.score === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.score))) : null,
        feedbackParseMethod: parseMethod,
        status: 'COMPLETED',
      },
      include: { decidedBy: { select: { name: true, email: true } } },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[upload-feedback] Unhandled error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
