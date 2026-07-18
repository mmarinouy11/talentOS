import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { extractPdfText } from '@/lib/pdf-extract'
import { callClaudeJSON } from '@/lib/anthropic'
import { uploadFileToDrive } from '@/lib/google'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { resolveEmailTemplate } from '@/lib/email-resolver'

const VENDOR_SUBMITTED_DEFAULT_SUBJECT = 'New candidate from {{vendorName}}: {{candidateName}} - {{positionTitle}}'
const VENDOR_SUBMITTED_DEFAULT_HTML = `<p>Hi {{recruiterName}},</p>\n<p><strong>{{vendorName}}</strong> has submitted a new candidate, <strong>{{candidateName}}</strong>, for <strong>{{positionTitle}}</strong>.</p>\n<p><a href="{{link}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Candidate</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`
import { getMonthlyHoursBaseline, hourlyToMonthly } from '@/lib/dgm'
import { locationAllowed } from '@/lib/location'

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
  const countryRaw = (formData.get('country') as string | null)?.trim() ?? ''
  const compensationRaw = (formData.get('desiredCompensation') as string | null)?.trim() ?? ''

  if (!cvFile || !positionId || !firstName || !lastName || !emailRaw || !countryRaw || !compensationRaw) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const desiredCompensation = parseFloat(compensationRaw)
  if (isNaN(desiredCompensation) || desiredCompensation < 0) {
    return NextResponse.json({ error: 'Invalid compensation value' }, { status: 400 })
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

  // CHECK 1 — Duplicate (strict): reject if candidate email exists anywhere in DB
  const existingCandidate = await db.candidate.findFirst({
    where: { email: emailRaw, deletedAt: null },
  })
  if (existingCandidate) {
    // Check if also linked to this position for a more specific message
    const existingCP = await db.candidatePosition.findFirst({
      where: { positionId, candidateId: existingCandidate.id },
    })
    const detail = existingCP
      ? 'A candidate with this email has already been submitted for this position.'
      : 'A candidate with this email address already exists in our system.'
    const message = existingCP
      ? 'A candidate with this email has already been submitted for this position.'
      : 'A candidate with this email address already exists in our system.'
    return NextResponse.json({
      rejected: true,
      reason: 'duplicate',
      message,
      checks: [
        { name: 'Eligibility Check', passed: false, detail },
      ],
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
    // Non-fatal — proceed with empty fields
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

  // Create candidate (duplicate check above guarantees no existing record)
  const createdCandidate = true
  const candidate = await db.candidate.create({
    data: {
      firstName,
      lastName,
      email: emailRaw,
      country: countryRaw,
      desiredCompensation,
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

  // Create CandidatePosition
  const cp = await db.candidatePosition.create({
    data: {
      candidateId: candidate.id,
      positionId,
      recruiterId: position.recruiterId,
    },
  })

  // CHECK 1b — Location (before expensive fit scoring)
  if (position.location && position.location.length > 0) {
    if (countryRaw && !locationAllowed(position.location, countryRaw)) {
      await db.candidatePosition.delete({ where: { id: cp.id } })
      if (createdCandidate) await db.candidate.delete({ where: { id: candidate.id } })
      return NextResponse.json({
        rejected: true,
        reason: 'location',
        message: 'This candidate\'s country does not match the requirements for this position.',
        checks: [
          { name: 'Eligibility Check', passed: true, detail: 'No prior submission found for this candidate.' },
          { name: 'Location', passed: false, detail: `This position is only open to candidates from: ${position.location.join(', ')}.` },
        ],
      })
    }
  }

  // CHECK 2 — Fit score (synchronous)
  await scoreCandidateForPosition(cp.id)
  const scored = await db.candidatePosition.findUnique({ where: { id: cp.id } })

  const thresholdSetting = await db.systemSettings.findUnique({ where: { key: 'VENDOR_MIN_FIT_SCORE' } })
  const globalThreshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 70
  const threshold = position.vendorMinFitScore ?? globalThreshold

  const fitScore = scored?.fitScore ?? 0
  if (fitScore < threshold) {
    await db.candidatePosition.delete({ where: { id: cp.id } })
    if (createdCandidate) await db.candidate.delete({ where: { id: candidate.id } })
    return NextResponse.json({
      rejected: true,
      reason: 'low_score',
      message: 'This candidate does not meet the technical requirements for this position based on their profile and skills.',
      checks: [
        { name: 'Eligibility Check', passed: true, detail: 'No prior submission found for this candidate.' },
        { name: 'Profile Match', passed: false, detail: `Score: ${Math.round(fitScore)}% (below minimum: ${Math.round(threshold)}%)` },
      ],
    })
  }

  // CHECK 3 — Compensation vs position budget (only if internalCostBudget is set)
  if (position.internalCostBudget != null) {
    const hoursBaseline = await getMonthlyHoursBaseline()
    const budgetMonthly = hourlyToMonthly(position.internalCostBudget, hoursBaseline)
    if (desiredCompensation > budgetMonthly) {
      await db.candidatePosition.delete({ where: { id: cp.id } })
      if (createdCandidate) await db.candidate.delete({ where: { id: candidate.id } })
      return NextResponse.json({
        rejected: true,
        reason: 'over_budget',
        message: `This candidate's expected compensation ($${desiredCompensation.toLocaleString()} USD/month) exceeds the budget for this position.`,
        checks: [
          { name: 'Eligibility Check', passed: true, detail: 'No prior submission found for this candidate.' },
          { name: 'Profile Match', passed: true, detail: `Score: ${Math.round(fitScore)}% (minimum: ${Math.round(threshold)}%)` },
          { name: 'Compensation', passed: false, detail: `$${desiredCompensation.toLocaleString()}/month exceeds the budget for this position.` },
        ],
      })
    }
  }

  // Accepted — notify recruiter
  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  const candidateName = `${firstName} ${lastName}`
  try {
    const { subject, html } = await resolveEmailTemplate(
      'TEMPLATE_VENDOR_CANDIDATE_SUBMITTED',
      VENDOR_SUBMITTED_DEFAULT_SUBJECT,
      VENDOR_SUBMITTED_DEFAULT_HTML,
      {
        recruiterName: position.recruiter.name ?? position.recruiter.email,
        candidateName,
        positionTitle: position.title,
        vendorName: vendor.name,
        link: `${baseUrl}/candidates/${candidate.id}`,
      }
    )
    await sendEmailViaSystemGmail({ to: position.recruiter.email, subject, html })
  } catch (err) {
    console.error('[vendor-portal] Failed to notify recruiter:', err)
    // Non-fatal — don't block acceptance
  }

  return NextResponse.json({ rejected: false, message: 'Candidate submitted successfully!' })
}
