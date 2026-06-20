export function schedulingRequestEmail({
  candidateName,
  positionTitle,
  client,
  roundLabel,
  recruiterName,
}: {
  candidateName: string
  positionTitle: string
  client: string
  roundLabel: string
  recruiterName: string
}): { subject: string; html: string } {
  const subject = `Interview Scheduling – ${positionTitle} at ${client}`
  const html = `
    <p>Hi ${candidateName},</p>
    <p>We'd like to schedule a <strong>${roundLabel}</strong> for the <strong>${positionTitle}</strong> role at <strong>${client}</strong>.</p>
    <p>Please reply with your availability for the next week so we can coordinate a time that works for everyone.</p>
    <p>Best regards,<br/>${recruiterName}</p>
  `
  return { subject, html }
}

export function rejectionEmail({
  candidateName,
  positionTitle,
  client,
  recruiterName,
}: {
  candidateName: string
  positionTitle: string
  client: string
  recruiterName: string
}): { subject: string; html: string } {
  const subject = `Update on your application – ${positionTitle} at ${client}`
  const html = `
    <p>Hi ${candidateName},</p>
    <p>Thank you for taking the time to interview for the <strong>${positionTitle}</strong> position at <strong>${client}</strong>.</p>
    <p>After careful consideration, we have decided to move forward with other candidates at this time. We will keep your profile on file for future opportunities that may be a great fit.</p>
    <p>We appreciate your interest and wish you the best in your search.</p>
    <p>Best regards,<br/>${recruiterName}</p>
  `
  return { subject, html }
}

export function advanceNotificationEmail({
  candidateName,
  positionTitle,
  client,
  nextRoundLabel,
  recruiterName,
}: {
  candidateName: string
  positionTitle: string
  client: string
  nextRoundLabel: string
  recruiterName: string
}): { subject: string; html: string } {
  const subject = `Great news – Moving forward for ${positionTitle} at ${client}`
  const html = `
    <p>Hi ${candidateName},</p>
    <p>We're pleased to let you know that you've been selected to advance in the interview process for <strong>${positionTitle}</strong> at <strong>${client}</strong>.</p>
    <p>The next step will be a <strong>${nextRoundLabel}</strong>. We will be in touch shortly with scheduling details.</p>
    <p>Best regards,<br/>${recruiterName}</p>
  `
  return { subject, html }
}
