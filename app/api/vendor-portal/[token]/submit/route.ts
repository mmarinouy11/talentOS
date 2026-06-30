import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { extractPdfText } from '@/lib/pdf-extract'
import { callClaudeJSON } from '@/lib/anthropic'
import { uploadFileToDrive } from '@/lib/google'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { vendorCandidateSubmittedEmail } from '@/lib/email-templates'

const CV_PARSE_SYSTEM = `You are a CV parser. Extract structured information from the CV text provided.
Return ONLY valid JSON with these exact fields:
{
  "seniority": one of "JUNIOR"|"MID"|"SENIOR"|"STAFF"|"PRINCIPAL" or null,
  "yearsOfExperience": number or null,
  "skills": array of strings,
  "languages": array of strings,
  "summary": string or null
}`

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Validate token
  const vendor = await db.vendor.findUnique({ where: { portalToken: token } })
  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }

  const formData = await request.formData()
  const cvFile = formData.get('cv') as File | null
  const positionId = formData.get('positionId') as string | null
  const firstName = (formData.get('firstName') as string | null)?.trim() ?? ''
  const lastName = (formData.get('lastName') as string | null)?.trim() ?? ''
  const emailRaw = (formData.get('email') as string | null)?.trim().toLowerCase() ?? ''

  if (!cvFile || !positionId || !firstName || !lastName || !emailRaw) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Security: confirm this position is actually assigned to this vendor
  const assignment = await db.positionVendor.findUnique({
    where: { positionId_vendorId: { positionId, vendorId: vendor.id } },
  })
  if (!assignment) {
    return NextResponse.json({ error: 'Position not assigned to this vendor' }, { status: 403 })
  }

  const position = await db.position.findFirst({
    where: { id: positionId, deletedAt: null, status: 'OPEN' },
    include: { recruiter: { select: { id: true, name: true, email: true } } },
  })
  if (!position) {
    return NextResponse.json({ error: 'Position not found or not open' }, { status: 404 })
  }

  // CHECK 1 — Duplicate: candidate with this email already linked to this position
  const existingCP = await db.candidatePosition.findFirst({
    where: {
      positionId,
      candidate: { email: emailRaw, deletedAt: null },
    },
  })
  if (existingCP) {
    return NextResponse.json({
      rejected: true,
      reason: 'duplicate',
      message: 'A candidate with this email has already been submitted for this position.',
    })
  }

  // Parse CV
  const buffer = Buffer.from(await cvFile.arrayBuffer())
  let cvText = ''
  try {
    cvText = await extractPdfText(buffer)
  } catch {
    return NextResponse.json({ error: 'Could not read the CV file. Please upload a valid PDF.' }, { status: 422 })
  }

  let parsed: {
    seniority: 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL' | null
    yearsOfExperience: number | null
    skills: string[]
    languages: string[]
    summary: string | null
  } = { seniority: null, yearsOfExperience: null, skills: [], languages: [], summary: null }
  try {
    parsed = await callClaudeJSON(
      `Parse this CV and return the structured JSON:\n\n${cvText.slice(0, 8000)}`,
      'FAST',
      CV_PARSE_SYSTEM
    )
  } catch {
    // Non-fatal — proceed with empty fields; fit scorer will still work with skills/summary
  }

  // Upload CV to Drive (non-fatal)
  let cvDriveId: string | undefined
  let cvOriginalName: string | undefined
  try {
    const { fileId, fileName } = await uploadFileToDrive(
      buffer,
      `${Date.now()}_${cvFile.name}`,
      cvFile.type,
      process.env.GOOGLE_DRIVE_FOLDER_ID!
    )
    cvDriveId = fileId
    cvOriginalName = fileName
  } catch {
    // continue without Drive upload
  }

  // Create or find candidate
  let candidate = await db.candidate.findFirst({
    where: { email: emailRaw, deletedAt: null },
  })
  const createdCandidate = !candidate
  if (!candidate) {
    candidate = await db.candidate.create({
      data: {
        firstName,
        lastName,
        email: emailRaw,
        seniority: parsed.seniority ?? undefined,
        yearsOfExperience: parsed.yearsOfExperience ?? null,
        skills: parsed.skills ?? [],
        languages: parsed.languages ?? [],
        summary: parsed.summary ?? null,
        cvDriveId: cvDriveId ?? null,
        cvOriginalName: cvOriginalName ?? null,
        sourcedByType: 'VENDOR',
        sourcedByVendorId: vendor.id,
        recruiterId: position.recruiterId,
      },
    })
  }

  // Create CandidatePosition
  const cp = await db.candidatePosition.create({
    data: {
      candidateId: candidate.id,
      positionId,
      recruiterId: position.recruiterId,
    },
  })

  // CHECK 2 — Score synchronously
  await scoreCandidateForPosition(cp.id)

  const scored = await db.candidatePosition.findUnique({ where: { id: cp.id } })

  // Get threshold (default 60 if not configured)
  const thresholdSetting = await db.systemSettings.findUnique({ where: { key: 'VENDOR_MIN_FIT_SCORE' } })
  const threshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 60

  if ((scored?.fitScore ?? 0) < threshold) {
    // Reject — clean up
    await db.candidatePosition.delete({ where: { id: cp.id } })
    if (createdCandidate) {
      await db.candidate.delete({ where: { id: candidate.id } })
    }
    return NextResponse.json({
      rejected: true,
      reason: 'low_score',
      message: 'This candidate does not meet the minimum requirements for this position.',
    })
  }

  // Accepted — notify recruiter
  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  const candidateName = `${firstName} ${lastName}`
  try {
    const { subject, html } = vendorCandidateSubmittedEmail({
      recruiterName: position.recruiter.name ?? position.recruiter.email,
      candidateName,
      positionTitle: position.title,
      vendorName: vendor.name,
      link: `${baseUrl}/candidates/${candidate.id}`,
    })
    await sendEmailViaSystemGmail({ to: position.recruiter.email, subject, html })
  } catch (err) {
    console.error('[vendor-portal] Failed to notify recruiter:', err)
    // Non-fatal — don't block acceptance
  }

  return NextResponse.json({ rejected: false, message: 'Candidate submitted successfully!' })
}
