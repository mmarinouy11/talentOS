/**
 * Historical ATS import script.
 * Run from project root:
 *   npx tsx scripts/import-historical-candidates.ts
 * Requires ANTHROPIC_API_KEY and DATABASE_URL in .env.local (loaded automatically).
 */

import path from 'path'
import { readFileSync } from 'fs'
import { config } from 'dotenv'
import type { Seniority } from '@prisma/client'

// Load .env.local before importing db / anthropic so env vars are available
config({ path: path.resolve(process.cwd(), '.env.local') })

import { db } from '../lib/db'
import { callClaudeJSON } from '../lib/anthropic'

const BATCH_SIZE = 10

const SENIORITY_VALUES = new Set<string>([
  'JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL',
])

interface RawRecord {
  candidateId: string
  firstName: string
  lastName: string
  email: string
  country: string | null
  seniority: string | null
  skills: string[]
  languages: string[]
  minimumCompensation: number | null
  desiredCompensation: number | null
  notes: string
  sourcedByOther: string
  _enrichment_source: string
  _position_applied: string
}

interface EnrichmentResult {
  skills: string[]
  seniority: string | null
  country: string | null
  yearsOfExperience: number | null
  summary: string | null
}

async function enrich(record: RawRecord): Promise<EnrichmentResult> {
  const prompt = `You are extracting candidate profile data from historical recruiting notes (written in Spanish, informal, conversational).

Position they historically applied for: ${record._position_applied}
Notes: ${record._enrichment_source}

Extract structured information and return ONLY valid JSON, no markdown:
{
  "skills": array of strings — specific technical skills, tools, frameworks mentioned. Infer from context even if not explicitly listed (e.g. "trabajó como desarrollador Java" implies Java),
  "seniority": one of "JUNIOR"|"MID"|"SENIOR"|"STAFF"|"PRINCIPAL" or null if unclear — infer from years of experience and role descriptions,
  "country": string or null — ONLY if explicitly inferable (e.g. "Vzla" = Venezuela, "pesos uruguayos" = Uruguay) — do NOT guess without clear signal,
  "yearsOfExperience": number or null,
  "summary": string — 2-3 sentence professional summary in English based on notes
}
Rules:
- Notes are in Spanish — understand them, output summary in English
- Be generous extracting skills/technologies mentioned anywhere
- Never fabricate — use null/empty array if no signal
- No markdown, no explanation, only the JSON object`

  try {
    const result = await callClaudeJSON<EnrichmentResult>(prompt, 'FAST')
    return {
      skills: Array.isArray(result.skills) ? result.skills : [],
      seniority: typeof result.seniority === 'string' ? result.seniority : null,
      country: typeof result.country === 'string' ? result.country : null,
      yearsOfExperience: typeof result.yearsOfExperience === 'number' ? result.yearsOfExperience : null,
      summary: typeof result.summary === 'string' && result.summary.trim() ? result.summary.trim() : null,
    }
  } catch (err) {
    console.error(`  [enrich] Failed for ${record.candidateId}: ${err}`)
    return { skills: [], seniority: null, country: null, yearsOfExperience: null, summary: null }
  }
}

function needsEnrichment(record: RawRecord): boolean {
  return record.skills.length === 0 || record.seniority === null || record.country === null
}

function mergeSkills(existing: string[], enriched: string[]): string[] {
  const normalized = new Map<string, string>()
  for (const s of existing) normalized.set(s.toLowerCase().trim(), s)
  for (const s of enriched) {
    const key = s.toLowerCase().trim()
    if (!normalized.has(key)) normalized.set(key, s)
  }
  return Array.from(normalized.values())
}

async function processRecord(record: RawRecord): Promise<{
  firstName: string
  lastName: string
  email: string
  country: string | null
  seniority: Seniority | null
  skills: string[]
  languages: string[]
  minimumCompensation: number | null
  desiredCompensation: number | null
  notes: string
  summary: string | null
  yearsOfExperience: number | null
  sourcedByType: 'OTHER'
  sourcedByOther: string
}> {
  let enriched: EnrichmentResult | null = null

  if (needsEnrichment(record)) {
    enriched = await enrich(record)
  }

  const skills = enriched
    ? mergeSkills(record.skills, enriched.skills)
    : record.skills

  const seniority = record.seniority ?? enriched?.seniority ?? null
  const validSeniority =
    seniority && SENIORITY_VALUES.has(seniority) ? (seniority as Seniority) : null

  const country = record.country ?? enriched?.country ?? null
  const summary = enriched?.summary ?? null
  const yearsOfExperience = enriched?.yearsOfExperience ?? null

  return {
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    country,
    seniority: validSeniority,
    skills,
    languages: record.languages,
    minimumCompensation: record.minimumCompensation,
    desiredCompensation: record.desiredCompensation,
    notes: record.notes,
    summary,
    yearsOfExperience,
    sourcedByType: 'OTHER',
    sourcedByOther: record.sourcedByOther,
  }
}

async function main() {
  const jsonPath = path.resolve(process.cwd(), 'clean_candidates.json')
  console.log(`Reading ${jsonPath}`)
  const raw: RawRecord[] = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  console.log(`Loaded ${raw.length} records`)

  let inserted = 0
  let skipped = 0
  let failed = 0

  const chunks: RawRecord[][] = []
  for (let i = 0; i < raw.length; i += BATCH_SIZE) {
    chunks.push(raw.slice(i, i + BATCH_SIZE))
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]

    const results = await Promise.all(chunk.map(processRecord))

    for (let i = 0; i < chunk.length; i++) {
      const record = chunk[i]
      const data = results[i]

      // Idempotency check
      const existing = await db.candidate.findUnique({ where: { email: data.email } })
      if (existing) {
        skipped++
        continue
      }

      try {
        await db.candidate.create({ data })
        inserted++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Unique constraint')) {
          skipped++
        } else {
          console.error(`  [insert] Failed for ${record.candidateId} (${data.email}): ${msg}`)
          failed++
        }
      }
    }

    const processed = Math.min((ci + 1) * BATCH_SIZE, raw.length)
    console.log(`Processed ${processed}/${raw.length} — inserted: ${inserted}, skipped: ${skipped}, failed: ${failed}`)
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped} failed=${failed}`)
  await db.$disconnect()
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
