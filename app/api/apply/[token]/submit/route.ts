import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { extractPdfText } from '@/lib/pdf-extract'
import { callClaudeJSON } from '@/lib/anthropic'
import { uploadFileToDrive } from '@/lib/google'
import { scoreCandidateForPosition } from '@/lib/fit-scorer'
import { sendEmailViaSystemGmail } from '@/lib/email'
import { directCandidateSubmittedEmail, directReturningCandidateEmail } from '@/lib/email-templates'
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

  const position = await db.position.findFirst({
    where: { applicationToken: token, deletedAt: null, status: 'OPEN' },
    include: { recruiter: { select: { id: true, name: true, email: true } } },
  })
  if (!position) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  const formData = await request.formData()
  const cvFile = formData.get('cv') as File | null
  const firstName = (formData.get('firstName') as string | null)?.trim() ?? ''
  const lastName = (formData.get('lastName') as string | null)?.trim() ?? ''
  const emailRaw = (formData.get('email') as string | null)?.trim().toLowerCase() ?? ''
  const phone = (formData.get('phone') as string | null)?.trim() ?? ''
  const linkedin = (formData.get('linkedin') as string | null)?.trim() ?? ''
  const countryRaw = (formData.get('country') as string | null)?.trim() ?? ''
  const desiredCompensationRaw = (formData.get('desiredCompensation') as string | null)?.trim() ?? ''
  const currentCompensationRaw = (formData.get('currentCompensation') as string | null)?.trim() ?? ''

  // Collect screening answers
  const screeningAnswers: string[] = []
  for (let i = 0; i < position.screeningQuestions.length; i++) {
    screeningAnswers.push(((formData.get(`answer_${i}`) as string | null) ?? '').trim())
  }

  if (!cvFile || !firstName || !lastName || !emailRaw || !countryRaw || !desiredCompensationRaw) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const desiredCompensation = parseFloat(desiredCompensationRaw)
  if (isNaN(desiredCompensation) || desiredCompensation < 0) {
    return NextResponse.json({ error: 'Invalid compensation value' }, { status: 400 })
  }

  const currentCompensation = currentCompensationRaw ? parseFloat(currentCompensationRaw) : null

  // Parse CV (needed for all three cases to update/create candidate data)
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
    // Non-fatal
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

  // Build notes from screening Q&A
  let notes: string | undefined
  if (position.screeningQuestions.length > 0 && screeningAnswers.some(Boolean)) {
    notes = position.screeningQuestions
      .map((q, i) => `Q: ${q}\nA: ${screeningAnswers[i] || '(no answer)'}`)
      .join('\n\n')
  }

  // Determine which of the three cases applies
  const existingCandidate = await db.candidate.findFirst({
    where: { email: emailRaw, deletedAt: null },
  })

  // Case 1 — Email exists AND already linked to this position → reject
  if (existingCandidate) {
    const existingCP = await db.candidatePosition.findFirst({
      where: { positionId: position.id, candidateId: existingCandidate.id },
    })
    if (existingCP) {
      return NextResponse.json({
        rejected: true,
        reason: 'duplicate',
        message: 'You have already applied for this position.',
        checks: [
          { name: 'Eligibility Check', passed: false, detail: 'An application with this email address already exists for this position.' },
        ],
      })
    }
  }

  // Case 2 — Email exists but NOT linked to this position → re-surface existing candidate
  let candidate: { id: string; firstName: string; lastName: string } | null = null
  let createdCandidate = false
  let isReturning = false

  if (existingCandidate) {
    candidate = existingCandidate
    isReturning = true
  } else {
    // Case 3 — New candidate
    candidate = await db.candidate.create({
      data: {
        firstName,
        lastName,
        email: emailRaw,
        phone: phone || null,
        linkedinUrl: linkedin || null,
        country: countryRaw,
        desiredCompensation,
        currentCompensation: currentCompensation ?? null,
        seniority: parsed.seniority ?? undefined,
        yearsOfExperience: parsed.yearsOfExperience ?? null,
        skills: parsed.skills ?? [],
        languages: parsed.languages ?? [],
        summary: parsed.summary ?? null,
        cvDriveId: cvDriveId ?? null,
        cvOriginalName: cvOriginalName ?? null,
        sourcedByType: 'DIRECT',
        recruiterId: position.recruiterId,
      },
    })
    createdCandidate = true
  }

  // Create CandidatePosition (Cases 2 and 3)
  const cp = await db.candidatePosition.create({
    data: {
      candidateId: candidate.id,
      positionId: position.id,
      recruiterId: position.recruiterId,
      notes: isReturning
        ? ['Re-applied via direct portal', notes].filter(Boolean).join('\n\n')
        : (notes ?? null),
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
        message: 'This position is not open to candidates from your country.',
        checks: [
          { name: 'Eligibility Check', passed: true, detail: 'No prior application found for this position.' },
          { name: 'Location', passed: false, detail: `This position is only open to candidates from: ${position.location.join(', ')}.` },
        ],
      })
    }
  }

  // CHECK 2 — Fit score (synchronous)
  await scoreCandidateForPosition(cp.id)
  const scored = await db.candidatePosition.findUnique({ where: { id: cp.id } })

  const thresholdSetting = await db.systemSettings.findUnique({ where: { key: 'DIRECT_MIN_FIT_SCORE' } })
  const globalThreshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 30
  const threshold = position.directMinFitScore ?? globalThreshold

  const fitScore = scored?.fitScore ?? 0
  if (fitScore < threshold) {
    await db.candidatePosition.delete({ where: { id: cp.id } })
    if (createdCandidate) await db.candidate.delete({ where: { id: candidate.id } })
    return NextResponse.json({
      rejected: true,
      reason: 'low_score',
      fitScore: Math.round(fitScore),
      message: 'Your profile does not meet the requirements for this position at this time.',
      checks: [
        { name: 'Eligibility Check', passed: true, detail: 'No prior application found for this position.' },
        { name: 'Profile Match', passed: false, detail: `Your profile scored ${Math.round(fitScore)}% (minimum required: ${Math.round(threshold)}%).` },
      ],
    })
  }

  // CHECK 3 — Compensation vs position budget
  if (position.internalCostBudget != null) {
    const hoursBaseline = await getMonthlyHoursBaseline()
    const budgetMonthly = hourlyToMonthly(position.internalCostBudget, hoursBaseline)
    if (desiredCompensation > budgetMonthly) {
      await db.candidatePosition.delete({ where: { id: cp.id } })
      if (createdCandidate) await db.candidate.delete({ where: { id: candidate.id } })
      return NextResponse.json({
        rejected: true,
        reason: 'over_budget',
        fitScore: Math.round(fitScore),
        message: `Your expected compensation exceeds the budget for this position.`,
        checks: [
          { name: 'Eligibility Check', passed: true, detail: 'No prior application found for this position.' },
          { name: 'Profile Match', passed: true, detail: `Your profile scored ${Math.round(fitScore)}%.` },
          { name: 'Compensation', passed: false, detail: `Your desired compensation ($${desiredCompensation.toLocaleString()}/month) exceeds the budget for this position.` },
        ],
      })
    }
  }

  // Accepted — notify recruiter (non-fatal)
  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  const candidateName = `${candidate.firstName} ${candidate.lastName}`
  try {
    const emailFn = isReturning ? directReturningCandidateEmail : directCandidateSubmittedEmail
    const { subject, html } = emailFn({
      recruiterName: position.recruiter.name ?? position.recruiter.email,
      candidateName,
      positionTitle: position.title,
      fitScore: Math.round(fitScore),
      link: `${baseUrl}/candidates/${candidate.id}`,
    })
    await sendEmailViaSystemGmail({ to: position.recruiter.email, subject, html })
  } catch (err) {
    console.error('[apply] Failed to notify recruiter:', err)
  }

  return NextResponse.json({
    rejected: false,
    fitScore: Math.round(fitScore),
    message: 'Your application has been submitted successfully!',
  })
}
