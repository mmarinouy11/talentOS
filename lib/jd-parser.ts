import { db } from './db'
import { callClaudeJSON } from './anthropic'
import type { Seniority } from '@prisma/client'

const LINKEDIN_QUERY_PROMPT = `Given a job position's required skills, seniority level, and location requirements, generate 2-3 LinkedIn X-ray search query strings a recruiter could paste into Google or LinkedIn search to find matching candidate profiles.

Use standard X-ray syntax, e.g.:
site:linkedin.com/in/ ("Java" OR "Spring Boot") AND "AWS" AND ("Senior" OR "Staff")

Return ONLY a JSON array of strings, no markdown:
["query 1", "query 2", "query 3"]

Rules:
- OR for synonym/equivalent skills, AND between distinct required skill groups
- Include seniority terms if specified
- Keep queries concise, 1-2 lines each
- No markdown, no explanation, only the JSON array`

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

    let linkedinQueries: string[] = []
    try {
      const queryPrompt = `Skills: ${(parsed.skills ?? []).join(', ') || 'not specified'}
Seniority: ${parsed.seniority ?? 'not specified'}
Location: ${position.location.join(', ') || 'not specified'}`
      linkedinQueries = await callClaudeJSON<string[]>(queryPrompt, 'FAST', LINKEDIN_QUERY_PROMPT)
      if (!Array.isArray(linkedinQueries)) linkedinQueries = []
    } catch {
      linkedinQueries = []
    }

    await db.position.update({
      where: { id: positionId },
      data: {
        jdParsed: true,
        jdSkills: parsed.skills ?? [],
        jdSeniority: parsed.seniority ?? null,
        jdLanguages: parsed.languages ?? [],
        jdSummary: parsed.summary ?? null,
        linkedinSearchQueries: linkedinQueries,
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
