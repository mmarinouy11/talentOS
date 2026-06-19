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

## Backlog (not yet built)

- **Bulk candidate import from LinkedIn export**: Allow uploading a .zip file
  containing a LinkedIn data export (connections, profile data) to bulk-create
  candidates. LinkedIn exports typically include CSV files (Connections.csv,
  Profile.csv, etc.) inside the zip. Will need: zip extraction, CSV parsing,
  field mapping from LinkedIn's schema to our Candidate model, dedup logic
  against existing candidates by email, and a review/confirm step before
  committing the bulk insert. Likely needs a dedicated /candidates/import page
  with upload + preview + confirm flow.
