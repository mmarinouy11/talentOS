import { db } from './db'
import { callClaudeJSON } from './anthropic'

const SYSTEM_PROMPT = `You are a recruiting intelligence system. Score how well a candidate matches a job position.
Return ONLY valid JSON with no markdown:
{
  "technicalFitScore": 0-100,
  "seniorityFitScore": 0-100,
  "domainFitScore": 0-100,
  "communicationFitScore": 0-100,
  "fitScore": 0-100,
  "fitSummary": "",
  "fitStrengths": [],
  "fitGaps": []
}
Scoring rules:
- technicalFitScore: % of required JD skills that candidate has
- seniorityFitScore: how well candidate seniority matches expected seniority
- domainFitScore: relevance of candidate experience to the role domain
- communicationFitScore: language match + communication profile
- fitScore: weighted average (technical 40%, seniority 25%, domain 20%, communication 15%)
- Be honest — a 60 is a decent match, 80+ is strong, 90+ is exceptional
- fitSummary: 2-3 sentences explaining the overall match
- fitStrengths: 3-5 specific matching points
- fitGaps: 2-4 missing skills or mismatches`

export async function scoreCandidateForPosition(candidatePositionId: string): Promise<void> {
  const cp = await db.candidatePosition.findFirst({
    where: { id: candidatePositionId },
    include: { candidate: true, position: true },
  })
  if (!cp) return

  const { candidate, position } = cp

  const prompt = `POSITION:
Title: ${position.title}
Client: ${position.client}
Required Skills: ${position.jdSkills.join(', ') || 'Not specified'}
Expected Seniority: ${position.jdSeniority ?? 'Not specified'}
Required Languages: ${position.jdLanguages.join(', ') || 'Not specified'}
Job Summary: ${position.jdSummary ?? 'Not specified'}
Full JD: ${position.description}

CANDIDATE:
Name: ${candidate.firstName} ${candidate.lastName}
Seniority: ${candidate.seniority ?? 'Not specified'}
Years of Experience: ${candidate.yearsOfExperience ?? 'Not specified'}
Skills: ${candidate.skills.join(', ') || 'Not specified'}
Languages: ${candidate.languages.join(', ') || 'Not specified'}
Summary: ${candidate.summary ?? 'Not specified'}`

  const scored = await callClaudeJSON<{
    technicalFitScore: number
    seniorityFitScore: number
    domainFitScore: number
    communicationFitScore: number
    fitScore: number
    fitSummary: string
    fitStrengths: string[]
    fitGaps: string[]
  }>(prompt, 'SMART', SYSTEM_PROMPT)

  await db.candidatePosition.update({
    where: { id: candidatePositionId },
    data: {
      fitScore: scored.fitScore,
      technicalFitScore: scored.technicalFitScore,
      seniorityFitScore: scored.seniorityFitScore,
      domainFitScore: scored.domainFitScore,
      communicationFitScore: scored.communicationFitScore,
      fitSummary: scored.fitSummary,
      fitStrengths: scored.fitStrengths ?? [],
      fitGaps: scored.fitGaps ?? [],
      fitScoredAt: new Date(),
    },
  })
}
