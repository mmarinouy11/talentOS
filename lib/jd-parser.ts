import { db } from './db'
import { callClaudeJSON } from './anthropic'
import type { Seniority } from '@prisma/client'

const SYSTEM_PROMPT = `You are a Job Description parser for a recruiting platform.
Extract structured information from the job description provided.
Return ONLY valid JSON with no markdown, no explanation:
{
  "skills": [],
  "seniority": "JUNIOR"|"MID"|"SENIOR"|"STAFF"|"PRINCIPAL",
  "languages": [],
  "summary": ""
}
Rules:
- skills must be specific technologies, not soft skills
- If seniority is not explicit, infer from required experience years and responsibilities
- languages should only be spoken human languages, never programming languages
- summary must be concise and action-oriented (1-2 sentences)`

interface JDParseResult {
  skills: string[]
  seniority: Seniority | null
  languages: string[]
  summary: string
}

export async function parseJD(positionId: string): Promise<JDParseResult | null> {
  try {
    const position = await db.position.findFirst({ where: { id: positionId, deletedAt: null } })
    if (!position) return null

    const parsed = await callClaudeJSON<JDParseResult>(
      `Parse this job description:\n\n${position.description}`,
      'FAST',
      SYSTEM_PROMPT
    )

    await db.position.update({
      where: { id: positionId },
      data: {
        jdParsed: true,
        jdSkills: parsed.skills ?? [],
        jdSeniority: parsed.seniority ?? null,
        jdLanguages: parsed.languages ?? [],
        jdSummary: parsed.summary ?? null,
      },
    })

    return parsed
  } catch (err) {
    console.error('JD parse failed:', err)
    return null
  }
}

export function parseJDInBackground(positionId: string): void {
  parseJD(positionId).catch((err) => console.error('Background JD parse error:', err))
}
