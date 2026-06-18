import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set')
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
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
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 200)}`)
  }
}
