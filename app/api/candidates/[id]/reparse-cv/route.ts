import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { uploadFileToDrive } from '@/lib/google'
import { anthropicErrorResponse } from '@/lib/anthropic'
import { parseCvFromBuffer } from '@/lib/cv-parser'

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

  let parsed: Awaited<ReturnType<typeof parseCvFromBuffer>>
  try {
    parsed = await parseCvFromBuffer(buffer)
  } catch (err) {
    console.error('[reparse-cv] Parsing failed:', err)
    return anthropicErrorResponse(err) ?? NextResponse.json({ error: 'Failed to parse CV' }, { status: 500 })
  }

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
      ...(Array.isArray(parsed.experience) && parsed.experience.length > 0 ? { cvExperience: parsed.experience } : {}),
      ...(Array.isArray(parsed.education) && parsed.education.length > 0 ? { cvEducation: parsed.education } : {}),
      cvDriveId,
      cvOriginalName,
    },
  })

  return NextResponse.json({ candidate, parsed })
}
