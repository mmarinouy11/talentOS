import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { extractPdfText } from '@/lib/pdf-extract'
import { uploadFileToDrive } from '@/lib/google'
import { callClaudeJSON } from '@/lib/anthropic'

const FEEDBACK_SYSTEM_PROMPT = `You are parsing interview feedback notes for a recruiting platform. The text comes from a PDF feedback form filled out by an interviewer (technical, managerial, or client-facing).

Extract structured information and return ONLY valid JSON, no markdown:
{
  "summary": "2-3 sentence overall assessment of the candidate's performance",
  "strengths": ["3-5 specific positive points mentioned"],
  "concerns": ["2-4 specific concerns, gaps, or red flags — empty array if none found"],
  "recommendedDecision": "ADVANCE | REJECT | UNCLEAR"
}
Rules:
- May be in English or Spanish — handle both
- Base everything strictly on what's written
- No markdown, no explanation, only the JSON object`

interface FeedbackParse {
  summary: string
  strengths: string[]
  concerns: string[]
  recommendedDecision: 'ADVANCE' | 'REJECT' | 'UNCLEAR'
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

  // Extract text
  let rawText: string
  try {
    rawText = await extractPdfText(buffer)
  } catch (err) {
    console.error('[upload-feedback] PDF extraction error:', err)
    return NextResponse.json({ error: `PDF text extraction failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 422 })
  }

  // Upload to Drive
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

  // Parse with Claude
  let parsed: FeedbackParse
  try {
    parsed = await callClaudeJSON<FeedbackParse>(
      `Parse this interview feedback:\n\n${rawText}`,
      'FAST',
      FEEDBACK_SYSTEM_PROMPT
    )
  } catch (err) {
    console.error('[upload-feedback] Claude parsing error:', err)
    return NextResponse.json({ error: `AI parsing failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }

  const aiRecommendedDecision =
    parsed.recommendedDecision === 'ADVANCE' || parsed.recommendedDecision === 'REJECT'
      ? parsed.recommendedDecision
      : null

  // Update interview — setting feedbackText triggers COMPLETED status via same logic as PATCH
  const updated = await db.interview.update({
    where: { id },
    data: {
      feedbackPdfUrl: fileId,
      feedbackText: rawText,
      feedbackSummary: parsed.summary,
      feedbackStrengths: parsed.strengths,
      feedbackConcerns: parsed.concerns,
      aiRecommendedDecision,
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
