import { callClaudeJSON } from '@/lib/anthropic'

const SYSTEM_PROMPT = `You are parsing interview feedback for a recruiting platform. The input may be either:
(a) Detailed notes or a transcript from the interview, OR
(b) A short, already-condensed assessment written by the interviewer/recruiter (e.g. "Strong technical skills, weak communication, would advance")

If input is type (b) — short and already conclusion-level — treat it AS the summary itself. Do not pad it out, do not claim information is missing just because it's brief. Extract whatever specific strengths/concerns ARE stated, even if there are only one or two.

If input is type (a) — longer and more conversational — synthesize a proper summary from it as usual.

Extract structured information and return ONLY valid JSON, no markdown:
{
  "summary": "2-3 sentences; if input was already short/conclusive, mirror the original phrasing rather than inventing detail",
  "strengths": ["whatever positive points are stated, can be as few as 1"],
  "concerns": ["whatever concerns are stated, empty array if none"],
  "score": number from 1 to 5 — assessment of how strong a fit this candidate is based on the feedback:
    1 = Poor fit, clear concerns outweigh strengths
    2 = Below average, more concerns than strengths
    3 = Average/mixed, balanced strengths and concerns
    4 = Strong fit, clear strengths with minor concerns
    5 = Excellent fit, overwhelmingly positive feedback
}
Rules:
- Never claim "insufficient information" if there is ANY substantive content, even a single sentence
- Only return minimal/empty fields if the input is truly empty or has zero substantive content
- score must be an integer 1-5
- May be in English or Spanish
- No markdown, no explanation, only the JSON object`

export interface FeedbackParseResult {
  summary: string
  strengths: string[]
  concerns: string[]
  score: number
}

export async function parseTextFeedback(text: string): Promise<FeedbackParseResult> {
  return callClaudeJSON<FeedbackParseResult>(
    `Parse this interview feedback:\n\n${text}`,
    'FAST',
    SYSTEM_PROMPT
  )
}
