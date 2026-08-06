import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { extractPdfText } from '@/lib/pdf-extract'
import { callClaudeJSON } from '@/lib/anthropic'
import { uploadFileToDrive } from '@/lib/google'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { resolveEmailTemplate } from '@/lib/email-resolver'
import { locationAllowed } from '@/lib/location'

const REFERRAL_SUBMITTED_DEFAULT_SUBJECT = 'New referral: {{candidateName}} — {{positionTitle}}'
const REFERRAL_SUBMITTED_DEFAULT_HTML = `<p>Hi {{recruiterName}},</p>\n<p><strong>{{vendorName}}</strong> referred a new candidate, <strong>{{candidateName}}</strong>, for <strong>{{positionTitle}}</strong>.</p>\n<p>Referred by: <strong>{{referrerName}}</strong></p>\n<p><a href="{{link}}" style="display:inline-block;background-color:#000000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Candidate</a></p>\n<p>Best,<br/>Tenarai LATAM</p>`

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

  const vendor = await db.vendor.findUnique({ where: { referralToken: token } })
  if (!vendor || !vendor.active || vendor.type !== 'REFERRAL_NETWORK') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }

  const formData = await request.formData()
  const cvFile = formData.get('cv') as File | null
  const positionId = formData.get('positionId') as string | null
  const referrerName = (formData.get('referrerName') as string | null)?.trim() ?? ''
  const firstName = (formData.get('firstName') as string | null)?.trim() ?? ''
  const lastName = (formData.get('lastName') as string | null)?.trim() ?? ''
  const emailRaw = (formData.get('email') as string | null)?.trim().toLowerCase() ?? ''
  const phone = (formData.get('phone') as string | null)?.trim() ?? ''
  const countryRaw = (formData.get('country') as string | null)?.trim() ?? ''
  const linkedinUrl = (formData.get('linkedinUrl') as string | null)?.trim() ?? ''
  const note = (formData.get('note') as string | null)?.trim() ?? ''

  if (!cvFile || !positionId || !referrerName || !firstName || !lastName || !emailRaw || !countryRaw) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Confirm position is assigned to this vendor
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

  // CHECK 1 — Duplicate
  const existingCandidate = await db.candidate.findFirst({
    where: { email: emailRaw, deletedAt: null },
  })
  if (existingCandidate) {
    const existingCP = await db.candidatePosition.findFirst({
      where: { positionId, candidateId: existingCandidate.id },
    })
    const message = existingCP
      ? 'A candidate with this email has already been submitted for this position.'
      : 'A candidate with this email address already exists in our system.'
    return NextResponse.json({
      rejected: true,
      reason: 'duplicate',
      message,
      checks: [
        { name: 'Eligibility Check', passed: false, detail: message },
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

  type ParsedCV = {
    seniority: 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL' | null
    yearsOfExperience: number | null
    skills: string[]
    languages: string[]
    summary: string | null
  }
  const defaultParsed: ParsedCV = { seniority: null, yearsOfExperience: null, skills: [], languages: [], summary: null }

  const [driveResult, parsedResult] = await Promise.all([
    uploadFileToDrive(buffer, `${Date.now()}_${cvFile.name}`, cvFile.type, process.env.GOOGLE_DRIVE_FOLDER_ID!)
      .catch(() => null),
    cvText
      ? callClaudeJSON<ParsedCV>(
          `Parse this CV and return the structured JSON:\n\n${cvText.slice(0, 8000)}`,
          'FAST',
          CV_PARSE_SYSTEM
        ).catch(() => null)
      : Promise.resolve(null),
  ])

  const parsed: ParsedCV = parsedResult ?? defaultParsed
  const cvDriveId = driveResult?.fileId
  const cvOriginalName = driveResult?.fileName

  const candidate = await db.candidate.create({
    data: {
      firstName,
      lastName,
      email: emailRaw,
      phone: phone || null,
      country: countryRaw,
      linkedinUrl: linkedinUrl || null,
      seniority: parsed.seniority ?? undefined,
      yearsOfExperience: parsed.yearsOfExperience ?? null,
      skills: parsed.skills ?? [],
      languages: parsed.languages ?? [],
      summary: parsed.summary ?? null,
      cvDriveId: cvDriveId ?? null,
      cvOriginalName: cvOriginalName ?? null,
      sourcedByType: 'REFERRAL',
      sourcedByVendorId: vendor.id,
      recruiterId: position.recruiterId,
    },
  })

  const referralNotes = note
    ? `Referred by: ${referrerName}\n${note}`
    : `Referred by: ${referrerName}`

  const cp = await db.candidatePosition.create({
    data: {
      candidateId: candidate.id,
      positionId,
      recruiterId: position.recruiterId,
      notes: referralNotes,
    },
  })

  // Location check
  if (position.location && position.location.length > 0) {
    if (countryRaw && !locationAllowed(position.location, countryRaw)) {
      await db.candidatePosition.delete({ where: { id: cp.id } })
      await db.candidate.delete({ where: { id: candidate.id } })
      return NextResponse.json({
        rejected: true,
        reason: 'location',
        message: "This candidate's country does not match the requirements for this position.",
        checks: [
          { name: 'Eligibility Check', passed: true, detail: 'No prior submission found for this candidate.' },
          { name: 'Location', passed: false, detail: `This position is only open to candidates from: ${position.location.join(', ')}.` },
        ],
      })
    }
  }

  // Fit score check
  await scoreCandidateForPosition(cp.id)
  const scored = await db.candidatePosition.findUnique({ where: { id: cp.id } })

  const thresholdSetting = await db.systemSettings.findUnique({ where: { key: 'VENDOR_MIN_FIT_SCORE' } })
  const globalThreshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 70
  const threshold = position.vendorMinFitScore ?? globalThreshold

  const fitScore = scored?.fitScore ?? 0
  if (fitScore < threshold) {
    await db.candidatePosition.delete({ where: { id: cp.id } })
    await db.candidate.delete({ where: { id: candidate.id } })
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

  // Notify recruiter
  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  const candidateName = `${firstName} ${lastName}`
  try {
    const { subject, html } = await resolveEmailTemplate(
      'TEMPLATE_REFERRAL_CANDIDATE_SUBMITTED',
      REFERRAL_SUBMITTED_DEFAULT_SUBJECT,
      REFERRAL_SUBMITTED_DEFAULT_HTML,
      {
        recruiterName: position.recruiter.name ?? position.recruiter.email,
        candidateName,
        positionTitle: position.title,
        vendorName: vendor.name,
        referrerName,
        link: `${baseUrl}/candidates/${candidate.id}`,
      }
    )
    await sendEmailViaSystemGmail({ to: position.recruiter.email, subject, html })
  } catch (err) {
    console.error('[refer] Failed to notify recruiter:', err)
  }

  // Auto-create SCREENING interview round
  try {
    await db.interview.create({
      data: {
        candidatePositionId: cp.id,
        stage: 'SCREENING',
        roundLabel: 'Screening',
        roundNumber: 1,
        isInternal: false,
        status: 'AWAITING_SCHEDULE',
      },
    })
  } catch (err) {
    console.error('[refer] Failed to create interview:', err)
  }

  return NextResponse.json({ rejected: false, message: 'Referral submitted successfully! Thank you.' })
}
