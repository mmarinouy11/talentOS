import { z } from 'zod'
import { parseEmailList } from './redeployment-proposal'

const schema = z.object({
  to: z.string().max(2000),
  cc: z.string().max(2000).optional().default(''),
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20000),
})

// Validates the composer payload: at least one valid To address, every address valid
export function parseProposalRequest(raw: unknown): { ok: true; msg: { to: string[]; cc: string[]; subject: string; body: string } } | { ok: false; error: string } {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Subject and body are required' }
  const to = parseEmailList(parsed.data.to)
  const cc = parseEmailList(parsed.data.cc)
  const invalid = [...to.invalid, ...cc.invalid]
  if (invalid.length > 0) return { ok: false, error: `Invalid email address: ${invalid.join(', ')}` }
  if (to.emails.length === 0) return { ok: false, error: 'Add at least one recipient' }
  return { ok: true, msg: { to: to.emails, cc: cc.emails.filter((e) => !to.emails.includes(e)), subject: parsed.data.subject, body: parsed.data.body } }
}
