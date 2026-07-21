import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AnthropicConfigError()
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

export class AnthropicConfigError extends Error {
  readonly userMessage = 'AI features are not configured correctly. Please contact your administrator.'
  constructor() { super('ANTHROPIC_API_KEY is not set'); this.name = 'AnthropicConfigError' }
}

export class AnthropicQuotaError extends Error {
  readonly userMessage = 'AI features are temporarily unavailable due to API limits. Please try again later or contact your administrator to check the Anthropic API credits.'
  constructor(cause?: string) { super(cause ?? 'Anthropic quota/rate limit exceeded'); this.name = 'AnthropicQuotaError' }
}

function classifyAnthropicError(err: unknown): AnthropicConfigError | AnthropicQuotaError | null {
  if (err instanceof AnthropicConfigError || err instanceof AnthropicQuotaError) return err
  if (!err || typeof err !== 'object') return null
  const e = err as Record<string, unknown>
  const status = e.status as number | undefined
  const type = (e.error as Record<string, unknown> | undefined)?.type as string | undefined
  const msg = String(e.message ?? '')

  if (type === 'authentication_error' || status === 401 || msg.includes('ANTHROPIC_API_KEY')) {
    return new AnthropicConfigError()
  }
  if (
    type === 'overloaded_error' || type === 'rate_limit_error' ||
    status === 529 || status === 429 || status === 402 ||
    msg.includes('overloaded') || msg.includes('rate limit') || msg.includes('credit')
  ) {
    return new AnthropicQuotaError(msg)
  }
  return null
}

/**
 * Returns a ready-to-return NextResponse for known Anthropic API errors, or null if
 * the error is unrelated. Use this at the top of any catch block that calls Claude.
 */
export function anthropicErrorResponse(err: unknown): NextResponse | null {
  const classified = classifyAnthropicError(err)
  if (!classified) return null
  const status = classified instanceof AnthropicQuotaError ? 503 : 500
  return NextResponse.json({ error: classified.userMessage }, { status })
}

// Model constants — use these everywhere, never hardcode model strings
export const MODELS = {
  // Fast extractions: CV parsing, field extraction, classification
  FAST: 'claude-haiku-4-5',
  // Complex reasoning: fit scoring, transcript analysis, copilot
  SMART: 'claude-sonnet-4-6',
} as const

// Helper: call Claude and get text response
export async function callClaude(
  prompt: string,
  model: keyof typeof MODELS = 'SMART',
  systemPrompt?: string
): Promise<string> {
  const anthropic = getAnthropic()
  const response = await anthropic.messages.create({
    model: MODELS[model],
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}

// Helper: call Claude and get parsed JSON response
export async function callClaudeJSON<T>(
  prompt: string,
  model: keyof typeof MODELS = 'SMART',
  systemPrompt?: string
): Promise<T> {
  const system =
    (systemPrompt ?? '') +
    '\nRespond ONLY with valid JSON. No markdown, no backticks, no explanation.'
  const text = await callClaude(prompt, model, system)
  try {
    const clean = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
    return JSON.parse(clean) as T
  } catch {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 200)}`)
  }
}
