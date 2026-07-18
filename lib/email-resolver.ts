import { db } from '@/lib/db'

export async function resolveEmailTemplate(
  key: string,
  defaultSubject: string,
  defaultHtml: string,
  variables: Record<string, string>
): Promise<{ subject: string; html: string }> {
  let subject = defaultSubject
  let html = defaultHtml
  try {
    const override = await db.systemEmailTemplate.findUnique({ where: { key } })
    if (override?.subject) subject = override.subject
    if (override?.htmlBody) html = override.htmlBody
  } catch (err) {
    console.error(`[resolveEmailTemplate] DB lookup failed for key ${key}:`, err)
  }
  for (const [varName, value] of Object.entries(variables)) {
    subject = subject.replaceAll(`{{${varName}}}`, value)
    html = html.replaceAll(`{{${varName}}}`, value)
  }
  return { subject, html }
}
