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

## Vendor Management

- Model: `Vendor` (name, pocName, pocEmail, phone, notes, active) — soft-delete via `active=false`
- Routes: `GET/POST /api/vendors`, `GET/PATCH/DELETE /api/vendors/[id]`
- Pages: `/vendors` (list), `/vendors/new`, `/vendors/[id]/edit`
- Sidebar: Vendors link added between Candidates and Reports

## Candidate Sourcing

- `SourceType` enum: `RECRUITER | VENDOR | OTHER`
- Candidate fields: `sourcedByType`, `sourcedByUserId`, `sourcedByVendorId`, `sourcedByOther`
- CandidateForm has a "Sourcing" section with conditional second field (user select / vendor select / free text)
- Sourcing displayed in candidate detail Profile card and candidates list "Source" column
- `CandidatePosition.recruiterId` displayed as "Owner" on the candidate-in-position detail page

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

## Interview Pipeline

- Enums: `PipelineStage` (APPLIED|SCREENING|TECHNICAL_INTERVIEW|MANAGER_INTERVIEW|CLIENT_INTERVIEW|OFFER|HIRED|REJECTED), `InterviewStatus` (PENDING|AWAITING_SCHEDULE|SCHEDULED|COMPLETED|CANCELLED), `InterviewDecision` (ADVANCE|REJECT|HOLD), `SchedulingMode` (MANUAL_SLOTS|CALENDAR_LINK)
- Model: `Interview` (candidatePositionId, stage, roundLabel, roundNumber, isInternal, status, schedulingMode, proposedSlots, calendarLinkUsed, scheduledAt, feedbackText/Summary/Strengths/Concerns, decision, decisionNotes, decidedAt, decidedById)
- Model: `EmailLog` (to, subject, template, status, errorMsg, sentAt, candidateId?, candidatePositionId?, interviewId?, sentById?)
- Routes: `GET/POST /api/candidate-positions/[id]/interviews`, `PATCH /api/interviews/[id]`, `POST /api/interviews/[id]/send-scheduling-email`
- Component: `components/app/InterviewsSection.tsx` — client component with Add/Edit/EmailPreview modals; props: candidatePositionId, candidateName, candidateEmail, positionTitle, clientName; displayed on `/positions/[id]/candidates/[cpId]`
- Email: `lib/email.ts` — `sendEmail()` wraps Resend + writes EmailLog; `getFromAddress()` reads SENDER_EMAIL from SystemSettings
- Templates: `lib/email-templates.ts` — `renderTemplate(template, tokens)`, `buildSchedulingTokens(...)`, `DEFAULT_*_TEMPLATE` constants; `schedulingRequestEmail`, `rejectionEmail`, `advanceNotificationEmail` accept optional `customTemplate`
- Recruiter templates: User model has `schedulingEmailTemplate`, `rejectionEmailTemplate`, `advanceEmailTemplate` (Text?); editable in `/profile`
- Email preview: Creating a SCREENING interview shows an editable email preview before sending; "Skip for now" leaves PENDING; "Send Email" → status becomes AWAITING_SCHEDULE
- "Send Scheduling Email" button visible on PENDING/AWAITING_SCHEDULE Screening interviews in Edit modal
- Settings: SENDER_EMAIL key in SystemSettings; editable via `/settings` (LABELS entry added)
- Debug page: `/settings/email-test` (ADMIN-only client page) + `POST /api/settings/email-test`
