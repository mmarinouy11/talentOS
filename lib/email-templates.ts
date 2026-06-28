const COMPANY_NAME = 'Tenarai'
const SIGNATURE_NAME = 'Tenarai LATAM'

export const DEFAULT_SCHEDULING_TEMPLATE = `<p>Hi {{candidateName}},</p>
<p>Thank you for your interest in the <strong>{{positionTitle}}</strong> role at <strong>{{clientName}}</strong>. We'd love to schedule a screening call with you.</p>
<p>{{schedulingLink}}</p>
<p>Looking forward to speaking with you!</p>
<p>Best,<br/>{{recruiterName}}</p>`

export const DEFAULT_REJECTION_TEMPLATE = `<p>Hi {{candidateName}},</p>
<p>Thank you for taking the time to participate in our process for the <strong>{{positionTitle}}</strong> role at <strong>{{clientName}}</strong>. After careful consideration, we've decided to move forward with other candidates at this time.</p>
<p>We appreciate your interest and wish you the best in your search.</p>
<p>Best,<br/>{{recruiterName}}</p>`

export const DEFAULT_ADVANCE_TEMPLATE = `<p>Hi {{candidateName}},</p>
<p>Great news! We'd like to move forward with the next step in our process for the <strong>{{positionTitle}}</strong> role: <strong>{{nextRoundLabel}}</strong>.</p>
<p>{{schedulingLink}}</p>
<p>Best,<br/>{{recruiterName}}</p>`

export const DEFAULT_NEXT_ROUND_TEMPLATE = `<p>Hi {{candidateName}},</p>
<p>Great news! We'd like to move forward with the next step in our process for the <strong>{{positionTitle}}</strong> role: <strong>{{roundLabel}}</strong>.</p>
<p>{{schedulingLink}}</p>
<p>Best,<br/>{{recruiterName}}</p>`

export function renderTemplate(template: string, tokens: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replaceAll(`{{${key}}}`, value || '')
  }
  return result
}

export function buildSchedulingTokens({
  candidateName,
  positionTitle,
  clientName: _clientName,
  recruiterName,
  roundLabel,
  slots,
  calendarLink,
  candidateCountry,
  durationMinutes,
}: {
  candidateName: string
  positionTitle: string
  clientName: string
  recruiterName: string
  roundLabel: string
  slots?: string[]
  calendarLink?: string | null
  candidateCountry?: string | null
  durationMinutes?: number | null
}): Record<string, string> {
  const { formatSlotForCandidate } = require('./timezone') as typeof import('./timezone')
  const duration = durationMinutes ? `${durationMinutes} minutes` : ''

  let schedulingLink = ''
  if (calendarLink) {
    schedulingLink = `<a href="${calendarLink}">Book a time here</a>`
    if (duration) schedulingLink += `<p>The call will be ${duration}.</p>`
  } else if (slots && slots.length > 0) {
    const formatted = slots.map((s) => formatSlotForCandidate(new Date(s), candidateCountry ?? null))
    schedulingLink = `<p>Please let us know which of the following times works best for you:</p><ul>${formatted.map((f) => `<li>${f}</li>`).join('')}</ul>`
    if (duration) schedulingLink += `<p>Each slot is a ${duration} call.</p>`
  }
  // clientName in candidate-facing emails is always the company brand, not the end client
  return { candidateName, positionTitle, clientName: COMPANY_NAME, recruiterName, roundLabel, schedulingLink, slotsList: schedulingLink, nextRoundLabel: '', duration }
}

export function schedulingRequestEmail({
  candidateName,
  positionTitle,
  client: _client,
  roundLabel,
  recruiterName,
  interviewTypeLabel,
  customTemplate,
}: {
  candidateName: string
  positionTitle: string
  client: string
  roundLabel: string
  recruiterName: string
  interviewTypeLabel?: string
  customTemplate?: string | null
}): { subject: string; html: string } {
  const typeLabel = interviewTypeLabel ?? 'Interview'
  const subject = `${typeLabel} - ${positionTitle} - ${candidateName}`
  const template = customTemplate ?? DEFAULT_SCHEDULING_TEMPLATE
  const html = renderTemplate(template, {
    candidateName, positionTitle, clientName: COMPANY_NAME, recruiterName, roundLabel, schedulingLink: '', slotsList: '', nextRoundLabel: '',
  })
  return { subject, html }
}

export function rejectionEmail({
  candidateName,
  positionTitle,
  client: _client,
  recruiterName,
  customTemplate,
}: {
  candidateName: string
  positionTitle: string
  client: string
  recruiterName: string
  customTemplate?: string | null
}): { subject: string; html: string } {
  const subject = `Update on your application - ${positionTitle} - ${candidateName}`
  const template = customTemplate ?? DEFAULT_REJECTION_TEMPLATE
  const html = renderTemplate(template, {
    candidateName, positionTitle, clientName: COMPANY_NAME, recruiterName, roundLabel: '', schedulingLink: '', slotsList: '', nextRoundLabel: '',
  })
  return { subject, html }
}

export function interviewerFeedbackInviteEmail({
  candidateName,
  positionTitle,
  interviewTypeLabel,
  feedbackUrl,
  recruiterName,
}: {
  candidateName: string
  positionTitle: string
  interviewTypeLabel: string
  feedbackUrl: string
  recruiterName: string
}): { subject: string; html: string } {
  const subject = `Feedback needed: ${candidateName} - ${interviewTypeLabel} - ${positionTitle}`
  const html = `<p>Hi,</p>
<p>Thank you for interviewing <strong>${candidateName}</strong> for the <strong>${positionTitle}</strong> position (${interviewTypeLabel}).</p>
<p>Please share your feedback using the link below. It only takes a few minutes and will help us make the best decision:</p>
<p><a href="${feedbackUrl}" style="background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Submit Feedback</a></p>
<p>This link is valid for 14 days and can only be used once.</p>
<p>Best,<br/>${recruiterName} · ${SIGNATURE_NAME}</p>`
  return { subject, html }
}

export function feedbackSubmittedNotificationEmail({
  recruiterName,
  candidateName,
  positionTitle,
  interviewType,
  scoreLabel,
  link,
}: {
  recruiterName: string
  candidateName: string
  positionTitle: string
  interviewType: string
  scoreLabel: string
  link: string
}): { subject: string; html: string } {
  const subject = `Feedback received: ${candidateName} - ${interviewType} - ${positionTitle}`
  const html = `<p>Hi ${recruiterName},</p>
<p>New feedback has been submitted for <strong>${candidateName}</strong> (${interviewType} - ${positionTitle}).</p>
<p>${scoreLabel}</p>
<p><a href="${link}" style="background:#1d4ed8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">View Full Feedback</a></p>
<p>Best,<br/>${SIGNATURE_NAME}</p>`
  return { subject, html }
}

export function advanceNotificationEmail({
  candidateName,
  positionTitle,
  client: _client,
  nextRoundLabel,
  recruiterName,
  customTemplate,
}: {
  candidateName: string
  positionTitle: string
  client: string
  nextRoundLabel: string
  recruiterName: string
  customTemplate?: string | null
}): { subject: string; html: string } {
  const subject = `Moving forward - ${positionTitle} - ${candidateName}`
  const template = customTemplate ?? DEFAULT_ADVANCE_TEMPLATE
  const html = renderTemplate(template, {
    candidateName, positionTitle, clientName: COMPANY_NAME, recruiterName, roundLabel: '', schedulingLink: '', slotsList: '', nextRoundLabel,
  })
  return { subject, html }
}
