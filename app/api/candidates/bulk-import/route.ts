import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { callClaudeJSON } from '@/lib/anthropic'
import { extractPdfText } from '@/lib/pdf-extract'
import AdmZip from 'adm-zip'
import { randomUUID } from 'crypto'
import { importJobs, scheduleJobCleanup, type ParsedCandidate } from '@/lib/import-jobs'

const LINKEDIN_SYSTEM_PROMPT = `You are a LinkedIn profile PDF parser. Extract structured information from a LinkedIn profile export.
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
  "languages": array of strings — SPOKEN/WRITTEN human languages only,
  "summary": string or null
}
Rules:
- Skills: specific technologies only, not soft skills
- Seniority based on total years: 0-2=JUNIOR, 2-5=MID, 5-8=SENIOR, 8-12=STAFF, 12+=PRINCIPAL
- Return null for fields you cannot determine
- Never guess email or phone
- Languages: only human spoken languages, never programming languages
- No markdown, no explanation, only the JSON object`

async function processJob(
  jobId: string,
  entries: AdmZip.IZipEntry[],
  emailMap: Map<string, string>
) {
  const job = importJobs.get(jobId)
  if (!job) return

  const chunkSize = 10
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    const chunkResults = await Promise.all(
      chunk.map(async (entry): Promise<ParsedCandidate> => {
        const fileName = entry.entryName.split('/').pop() ?? entry.entryName
        try {
          const pdfBuffer = entry.getData()
          const text = await extractPdfText(pdfBuffer)

          if (!text.trim()) {
            return {
              fileName,
              firstName: null, lastName: null, email: null, phone: null,
              country: null, linkedinUrl: null, seniority: null,
              yearsOfExperience: null, skills: [], languages: [], summary: null,
              duplicate: false,
              error: 'Could not extract text from PDF',
            }
          }

          const parsed = await callClaudeJSON<Omit<ParsedCandidate, 'fileName' | 'duplicate' | 'existingId' | 'error'>>(
            `Parse this LinkedIn profile PDF and return the structured JSON:\n\n${text.slice(0, 8000)}`,
            'FAST',
            LINKEDIN_SYSTEM_PROMPT
          )

          const email = parsed.email ?? null
          const isDuplicate = !!(email && emailMap.has(email.toLowerCase()))
          const existingId = email ? emailMap.get(email.toLowerCase()) : undefined

          return {
            fileName,
            ...parsed,
            skills: parsed.skills ?? [],
            languages: parsed.languages ?? [],
            duplicate: isDuplicate,
            existingId,
          }
        } catch (err) {
          console.error(`Failed to parse ${fileName}:`, err)
          return {
            fileName,
            firstName: null, lastName: null, email: null, phone: null,
            country: null, linkedinUrl: null, seniority: null,
            yearsOfExperience: null, skills: [], languages: [], summary: null,
            duplicate: false,
            error: 'Parse failed',
          }
        }
      })
    )

    if (!importJobs.has(jobId)) return // job was cleaned up
    job.results.push(...chunkResults)
    job.completed = job.results.length
  }

  job.done = true
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (!file.name.endsWith('.zip')) {
      return NextResponse.json({ error: 'File must be a .zip archive' }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries().filter(
      (e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.pdf')
    )

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No PDF files found in the zip archive' }, { status: 400 })
    }

    if (entries.length > 50) {
      return NextResponse.json({ error: 'Too many files (max 50 PDFs per batch)' }, { status: 400 })
    }

    // Fetch existing emails for dedup check
    const { db } = await import('@/lib/db')
    const existingCandidates = await db.candidate.findMany({
      where: { deletedAt: null },
      select: { id: true, email: true },
    })
    const emailMap = new Map(existingCandidates.map((c) => [c.email.toLowerCase(), c.id]))

    // Create job and return immediately
    const jobId = randomUUID()
    importJobs.set(jobId, { total: entries.length, completed: 0, done: false, results: [] })
    scheduleJobCleanup(jobId)

    // Process in background
    processJob(jobId, entries, emailMap).catch((err) => {
      const job = importJobs.get(jobId)
      if (job) { job.done = true; job.error = 'Processing failed unexpectedly' }
      console.error('Import job failed:', err)
    })

    return NextResponse.json({ jobId, total: entries.length })
  } catch (err) {
    console.error('Bulk import error:', err)
    return NextResponse.json({ error: 'Failed to process zip file' }, { status: 500 })
  }
}
