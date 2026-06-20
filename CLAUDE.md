@AGENTS.md

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via Prisma 7 |
| Auth | NextAuth v5 (Credentials + Google OAuth) |
| AI | Anthropic API — claude-haiku-4-5 (fast) / claude-sonnet-4-6 (smart) |
| File storage | Google Drive (service account) |
| Email | Resend |

## AI usage patterns

Import from `lib/anthropic.ts`:
- `callClaude(prompt, model?, systemPrompt?)` — returns string
- `callClaudeJSON<T>(prompt, model?, systemPrompt?)` — returns parsed JSON
- Use `FAST` model for: CV field extraction, classification, simple summaries
- Use `SMART` model for: fit scoring, transcript analysis, copilot outputs
- Always wrap calls in try/catch — never let AI failures crash the UI

## Bulk LinkedIn Import

- Route: `POST /api/candidates/bulk-import` — accepts .zip, starts background job, returns `{ jobId, total }` immediately
- Route: `GET /api/candidates/bulk-import/status/[jobId]` — polls job progress `{ total, completed, done, results }`
- Route: `POST /api/candidates/bulk-import/confirm` — bulk-creates candidates; optional `positionId` also creates CandidatePosition + triggers scoring
- Component: `components/app/LinkedInImportFlow.tsx` — shared upload+poll+review flow; used standalone and inside modal
- Page: `/candidates/import` — standalone wrapper around LinkedInImportFlow
- Modal: `AddCandidateToPositionModal` — two tabs: "Search Existing" and "Import from LinkedIn" (uses LinkedInImportFlow with positionId)
- Shared PDF extraction: `lib/pdf-extract.ts` (used by both CV upload and bulk import)
- Job state: `lib/import-jobs.ts` — module-level Map, 30-min TTL
- Dedup: by email (case-insensitive) against existing non-deleted candidates
- Max: 50 PDFs per batch, 50MB zip
