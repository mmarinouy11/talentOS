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
  clientName,
  recruiterName,
  roundLabel,
  slots,
  calendarLink,
}: {
  candidateName: string
  positionTitle: string
  clientName: string
  recruiterName: string
  roundLabel: string
  slots?: string[]
  calendarLink?: string | null
}): Record<string, string> {
  let schedulingLink = ''
  if (calendarLink) {
    schedulingLink = `<a href="${calendarLink}">Book a time here</a>`
  } else if (slots && slots.length > 0) {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    schedulingLink = `<p>Please let us know which of the following times works best for you:</p><ul>${slots.map((s) => `<li>${fmt(s)}</li>`).join('')}</ul>`
  }
  return { candidateName, positionTitle, clientName, recruiterName, roundLabel, schedulingLink, slotsList: schedulingLink, nextRoundLabel: '' }
}

export function schedulingRequestEmail({
  candidateName,
  positionTitle,
  client,
  roundLabel,
  recruiterName,
  customTemplate,
}: {
  candidateName: string
  positionTitle: string
  client: string
  roundLabel: string
  recruiterName: string
  customTemplate?: string | null
}): { subject: string; html: string } {
  const subject = `Interview Scheduling – ${positionTitle} at ${client}`
  const template = customTemplate ?? DEFAULT_SCHEDULING_TEMPLATE
  const html = renderTemplate(template, {
    candidateName, positionTitle, clientName: client, recruiterName, roundLabel, schedulingLink: '', slotsList: '', nextRoundLabel: '',
  })
  return { subject, html }
}

export function rejectionEmail({
  candidateName,
  positionTitle,
  client,
  recruiterName,
  customTemplate,
}: {
  candidateName: string
  positionTitle: string
  client: string
  recruiterName: string
  customTemplate?: string | null
}): { subject: string; html: string } {
  const subject = `Update on your application – ${positionTitle} at ${client}`
  const template = customTemplate ?? DEFAULT_REJECTION_TEMPLATE
  const html = renderTemplate(template, {
    candidateName, positionTitle, clientName: client, recruiterName, roundLabel: '', schedulingLink: '', slotsList: '', nextRoundLabel: '',
  })
  return { subject, html }
}

export function advanceNotificationEmail({
  candidateName,
  positionTitle,
  client,
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
  const subject = `Great news – Moving forward for ${positionTitle} at ${client}`
  const template = customTemplate ?? DEFAULT_ADVANCE_TEMPLATE
  const html = renderTemplate(template, {
    candidateName, positionTitle, clientName: client, recruiterName, roundLabel: '', schedulingLink: '', slotsList: '', nextRoundLabel,
  })
  return { subject, html }
}
