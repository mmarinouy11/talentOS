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
- Dedup: each parsed row gets a `match` (New / Existing / Conflict / Possible duplicate) from `findCandidateMatches`; existing rows unchecked by default and linked (not created) when checked inside a position; conflict rows not selectable; confirm re-checks server-side
- Max: 50 PDFs per batch, 50MB zip

## Interview Pipeline

- Enums: `PipelineStage` (APPLIED|SCREENING|TECHNICAL_INTERVIEW|MANAGER_INTERVIEW|CLIENT_INTERVIEW|OFFER|HIRED|REJECTED), `InterviewStatus` (PENDING|AWAITING_SCHEDULE|SCHEDULED|COMPLETED|CANCELLED), `InterviewDecision` (ADVANCE|REJECT|HOLD), `SchedulingMode` (MANUAL_SLOTS|CALENDAR_LINK)
- Model: `Interview` (candidatePositionId, stage, roundLabel, roundNumber, isInternal, status, schedulingMode, proposedSlots, calendarLinkUsed, scheduledAt, feedbackText/Summary/Strengths/Concerns, decision, decisionNotes, decidedAt, decidedById)
- Model: `EmailLog` (to, subject, template, status, errorMsg, sentAt, candidateId?, candidatePositionId?, interviewId?, sentById?)
- Routes: `GET/POST /api/candidate-positions/[id]/interviews`, `PATCH /api/interviews/[id]`, `POST /api/interviews/[id]/send-scheduling-email`, `POST /api/interviews/[id]/send-rejection-email`
- Component: `components/app/InterviewsSection.tsx` — client component with Add/Edit/EmailPreview modals; props: candidatePositionId, candidateName, candidateEmail, positionTitle, clientName; displayed on `/positions/[id]/candidates/[cpId]`
- Email: `lib/email.ts` — `sendEmail()` wraps Resend + writes EmailLog; `getFromAddress()` reads SENDER_EMAIL from SystemSettings
- Templates: `lib/email-templates.ts` — `renderTemplate(template, tokens)`, `buildSchedulingTokens(...)`, `DEFAULT_*_TEMPLATE` constants; `schedulingRequestEmail`, `rejectionEmail`, `advanceNotificationEmail` accept optional `customTemplate`
- Pipeline helpers: `lib/pipeline.ts` — `STAGE_SEQUENCE`, `getNextStage(stage)`
- Recruiter templates: User model has `schedulingEmailTemplate`, `rejectionEmailTemplate`, `advanceEmailTemplate` (Text?); editable in `/profile`
- Email preview: Creating a SCREENING/TECHNICAL/MANAGER/CLIENT interview shows an editable scheduling email preview before sending; "Skip for now" leaves PENDING; "Send Email" → status becomes AWAITING_SCHEDULE
- "Send Scheduling Email" button visible on PENDING/AWAITING_SCHEDULE Screening interviews in Edit modal
- Decision flows: saving REJECT → rejection email preview modal; saving ADVANCE → NextRoundModal (select stage → schedule slots → email preview); HOLD → no email
- Feedback PDF: `POST /api/interviews/[id]/upload-feedback` — PDF only, max 10MB; extracts text via `lib/pdf-extract.ts`, uploads to Drive (prefix `feedback_`), renders image-based PDFs via `pdftoppm` (poppler-utils), parses with Claude → feedbackSummary/Strengths/Concerns/aiRecommendedDecision/feedbackParseMethod; auto-sets status COMPLETED
- Interview model: `feedbackPdfUrl` (Drive file ID), `aiRecommendedDecision` (InterviewDecision?), `feedbackParseMethod` ("text"|"vision"), `durationMinutes` — AI-suggested decision shown as hint near Decision dropdown, never auto-fills recruiter's choice
- Manual feedback text: PATCH /api/interviews/[id] calls Claude Haiku when feedbackText changes, auto-populates same fields
- Status auto-derivation: scheduledAt→SCHEDULED, feedbackText→COMPLETED, action:'cancel'→CANCELLED; no direct status field in edit form
- Scheduling slots: 15-min increments, recruiter timezone selector (saved to User.timezone), configurable durationMinutes per interview and as SystemSettings defaults (DEFAULT_DURATION_SCREENING_MANAGER, DEFAULT_DURATION_OTHER)
- Candidate timezone: slot times formatted in candidate's country timezone in scheduling emails; `lib/timezone.ts` has COUNTRY_TIMEZONE_MAP and formatSlotForCandidate()
- Settings: SENDER_EMAIL key in SystemSettings; editable via `/settings` (LABELS entry added)
- Debug page: `/settings/email-test` (ADMIN-only client page) + `POST /api/settings/email-test`
- nixpacks.toml: `nixPkgs = ["poppler_utils"]` required for pdftoppm in Railway production

## Pipeline Insights

- Position-level: `POST /api/positions/[id]/generate-insights` — requires ≥2 interviews with feedback; calls Claude SMART; saves to Position fields (insightsSummary, insightsCommonStrengths, insightsCommonConcerns, insightsBottleneckStage, insightsRecommendation, insightsGeneratedAt)
- Global: `POST /api/insights/generate-global` — requires ≥5 interviews org-wide with feedback; calls Claude SMART; upserts single GlobalInsights row (deleteMany + create)
- Components: `PositionInsights` (on position detail page) and `GlobalInsights` (on /reports page) — client components with Generate/Regenerate button, display summary/strengths/concerns/bottleneck/recommendation
- Both are on-demand (button-triggered), not automatic

## LinkedIn Search Queries

- Position model field: `linkedinSearchQueries String[]`
- Generated automatically after JD parsing (`parseJD` in `lib/jd-parser.ts`) — calls Claude FAST with extracted skills/seniority/location
- On-demand route: `POST /api/positions/[id]/generate-linkedin-queries` — generates without re-parsing JD
- UI: subsection in `JDIntelligence` component — monospace query boxes with per-query Copy button (clipboard + "Copied!" flash), Generate/Regenerate button

## Role-Based Access

- Settings pages (`/settings`, `/settings/*`) redirect non-ADMIN users to `/positions`
- `GET /api/settings` and `PATCH /api/settings/[key]` return 403 for non-ADMIN
- Sidebar only shows Settings link for ADMIN role (handled in `app/(dashboard)/layout.tsx`)

## Proactive Positions

- `PositionType` enum: `REQUISITION` (default) | `PROACTIVE`; Position fields `type`, `convertedAt`
- Proactive = pipeline built ahead of an approved requisition; headcount not applicable (stored null)
- Type is chosen at creation only; `POST /api/positions/[id]/convert` (ADMIN or lead recruiter) sets type=REQUISITION, convertedAt, status=OPEN, headcount
- SLA kickoff everywhere = `convertedAt ?? createdAt`
- Excluded (filter `type: 'REQUISITION'`): /positions status cards + headcount, Account Report (all tabs + client list), Pipeline Report (web/preview/print/cron), reporting-cron (per-position emails + auto-close), org-wide analytics (`lib/analytics.ts` without positionId), Recruiter Performance demand/SLA/closures
- Recruiter Performance Qualified includes proactive (shown as "N + M proactive")
- Partner/referral portals and direct applications are disabled for proactive positions (UI hidden, APIs reject)
- Proactive backups: `POST /api/positions/[id]/backup` clones a REQUISITION (any status) into a PROACTIVE position with `sourcePositionId`; copies JD intelligence as-is (no re-parse), not candidates/partners/headcount. Detail page shows "Backup for" / "Backups" links
- Backup modal option "Bring active candidates (N)" (default on): in the same transaction copies each ACTIVE CandidatePosition (stage, recruiter, fit scores, createdAt, stageEnteredAt) plus one StageHistory entry (null → stage, movedAt = stageEnteredAt); interviews/history stay on the original, which is not modified

## Candidate Identity

- `Candidate.email` is optional (`String? @unique`); `linkedinHandle` (`String? @unique`) is set from `linkedinUrl` on every write via `normalizeLinkedinHandle()` (`lib/linkedin.ts`)
- Creation requires a real email or a LinkedIn profile URL (`lib/candidate-identifier.ts`, client-safe); no placeholder emails are generated anymore (`isPlaceholderEmail()` kept for legacy data)
- Portals (vendor, referral, direct apply) still require an email
- Duplicate checks: `findCandidateMatches()` in `lib/candidate-identity.ts` (server) → exact (email case-insensitive or LinkedIn handle) / conflict (email and LinkedIn match different candidates) / possible (normalized name + phone or country). POST /api/candidates returns 409 `{ duplicate }` for exact/conflict, and for possible unless `allowPossibleDuplicate`; UI in `DuplicateCandidatePanel`. PATCH returns 409 `{ conflictCandidate }` when the new email/LinkedIn belongs to another candidate
- Portals: vendor/referral reject any email or LinkedIn match; direct apply re-surfaces the matched candidate
- CV files: `cvOriginalName` stores the user's file name (Drive names carry a timestamp prefix). Rejected portal submissions move their CV to the Drive trash (`trashDriveFileQuietly`). `scripts/orphan-cvs-report.ts`: dry run / `--apply` (trash, never permanent delete) / `--match [--apply]` to attach orphan CVs to candidates without one
- Cleanup: `scripts/dedupe-candidates.ts` — dry run (default), `--report` (CSV in `reports/`, gitignored), `--apply` (backfill), `--apply --groups=certain` or `--apply --approve=file.csv` to merge

## Home Screen

- `/` renders the daily home for signed-in users (inside `DashboardShell`, shared with the `(dashboard)` layout); visitors keep the landing page. "Home" is the first sidebar item
- Data: `getHomeData()` in `lib/home.ts` (one positions query + one "starting soon" query); UI: `components/app/home/HomeScreen.tsx` (server component)
- Scope: OPEN requisitions, ACTIVE candidates; "Starting soon" = HIRED with startDate in the next 7 days on OPEN or FILLED requisitions; today's interviews include any candidate status
- "Today" in America/Montevideo; business days via `lib/business-days.ts` (shared with Recruiter Performance); thresholds in `lib/home-thresholds.ts`
- Shared: `HcFraction` (○/◐/✓), `lib/stage-labels.ts`
- Fulfilled positions (HIRED count ≥ headcount, null = 1) are excluded from Feedback pending, No next step, New applications, Bottlenecks and their counters; still in Today's interviews and Starting soon; shown muted at the bottom of their client in Open positions
- Layout: two columns on lg (Needs attention ≈60% | Today's interviews + Bottlenecks ≈40%), Open positions full width below. "Feedback pending" (interviews before today with no decision; Owner = CandidatePosition recruiter) and "No next step" (non-Pipeline, ≥7d in stage, nothing pending or scheduled; grouped by position, expandable) each have a counter; lists other than "Waiting for a decision" show 5 rows + "Show all"; decided interviews collapse at the bottom. Toggles in `components/app/home/HomeToggles.tsx` (client)

## Backlog

- Automatic interview scheduling confirmation: currently moving an Interview to
  SCHEDULED requires the recruiter to manually enter a confirmed date after
  coordinating with the candidate. Explore automating via Google Calendar webhook
  or a candidate-facing confirmation page tied to a unique link per Interview.

- Reporting cron multi-instance: `lib/reporting-cron.ts` uses node-cron which
  runs in-process. If Railway ever scales to multiple instances, each will fire
  independently and send duplicate emails. Fix by moving to a database-locked job
  (e.g. pg_advisory_lock), a queue (BullMQ/Redis), or an external scheduler.
