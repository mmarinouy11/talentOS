import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { callClaudeJSON } from '@/lib/anthropic'
import { extractPdfText } from '@/lib/pdf-extract'
import { uploadFileToDrive } from '@/lib/google'
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
  "summary": string or null,
  "experience": array of objects with shape { "title": string, "company": string, "startDate": string, "endDate": string, "bullets": string[] } — one entry per role, bullets are key achievements (2-4 per role),
  "education": array of objects with shape { "degree": string, "institution": string, "year": string or null }
}
Rules:
- Skills: specific technologies only, not soft skills
- Seniority based on total years: 0-2=JUNIOR, 2-5=MID, 5-8=SENIOR, 8-12=STAFF, 12+=PRINCIPAL
- Return null for fields you cannot determine
- Never guess email or phone
- Languages: only human spoken languages, never programming languages
- "experience" and "education" must be arrays (empty array [] if not found)
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
        const fallback = {
          fileName,
          firstName: null, lastName: null, email: `unknown@import.linkedin.com`, phone: null,
          country: null, linkedinUrl: null, seniority: null,
          yearsOfExperience: null, skills: [], languages: [], summary: null,
          experience: [], education: [], cvDriveId: null, cvOriginalName: null,
          duplicate: false,
        }
        try {
          const pdfBuffer = entry.getData()
          const text = await extractPdfText(pdfBuffer)

          if (!text.trim()) {
            return { ...fallback, error: 'Could not extract text from PDF' }
          }

          const [driveResult, parsed] = await Promise.all([
            uploadFileToDrive(
              pdfBuffer,
              `${Date.now()}_${fileName}`,
              'application/pdf',
              process.env.GOOGLE_DRIVE_FOLDER_ID!
            ).catch((err) => {
              console.error(`[bulk-import] Drive upload failed for ${fileName}:`, err)
              return null
            }),
            callClaudeJSON<Omit<ParsedCandidate, 'fileName' | 'duplicate' | 'existingId' | 'error' | 'cvDriveId' | 'cvOriginalName'>>(
              `Parse this LinkedIn profile PDF and return the structured JSON:\n\n${text.slice(0, 8000)}`,
              'FAST',
              LINKEDIN_SYSTEM_PROMPT
            ),
          ])

          const rawEmail = parsed.email ?? null
          const email: string = rawEmail ?? (() => {
            const first = (parsed.firstName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '.')
            const last  = (parsed.lastName  ?? '').toLowerCase().replace(/[^a-z0-9]/g, '.')
            const base  = [first, last].filter(Boolean).join('.') || 'unknown'
            return `${base}@import.linkedin.com`
          })()
          const isDuplicate = emailMap.has(email.toLowerCase())
          const existingId = isDuplicate ? emailMap.get(email.toLowerCase()) : undefined

          return {
            fileName,
            ...parsed,
            email,
            skills: parsed.skills ?? [],
            languages: parsed.languages ?? [],
            experience: parsed.experience ?? [],
            education: parsed.education ?? [],
            cvDriveId: driveResult?.fileId ?? null,
            cvOriginalName: driveResult?.fileName ?? fileName,
            duplicate: isDuplicate,
            existingId,
          }
        } catch (err) {
          console.error(`Failed to parse ${fileName}:`, err)
          return { ...fallback, error: 'Parse failed' }
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
