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

- `SourceType` enum: `RECRUITER | VENDOR | OTHER | DIRECT | REFERRAL | REDEPLOYMENT`
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

## Bulk CV Upload

- Multiple PDF/DOCX CVs (max 50 per batch, 10 MB each; NOT the LinkedIn zip). Entry points: "Upload CVs" tab in `AddCandidateToPositionModal` (batch for that position) and "Upload CVs" button on /candidates (talent pool only). RECRUITER and ADMIN (`lib/bulk-upload-auth.ts`)
- Models `BulkUpload` (PROCESSING → READY → COMPLETED | CANCELLED) and `BulkUploadItem` (PENDING | PROCESSING | DONE | NEEDS_DECISION | FAILED | SKIPPED; matchType NEW | EXISTING | POSSIBLE_DUPLICATE)
- `POST /api/bulk-uploads`: uploads files to Drive (`<timestamp>_<name>`), sha256 hash, identical files in the batch → SKIPPED "Duplicate file", returns immediately
- Worker `lib/bulk-upload-worker.ts` (started in `instrumentation.ts`, guard on globalThis): polls every 15 s, concurrency 2, atomic claim (PENDING → PROCESSING, attempts+1); PROCESSING > 10 min → PENDING; 3 attempts → FAILED with a readable error. Also kicked right after upload/retry
- Per item (`processBulkItem` in `lib/bulk-upload.ts`): `parseCvFromBuffer(buffer, 'pdf'|'docx')` (DOCX via mammoth; scanned PDFs via images, else the PDF as a Claude document) → no email and no LinkedIn → NEEDS_DECISION with matchType null ("Missing contact", amber; `isMissingContact()`), no candidate; recruiter adds an email or LinkedIn URL inline on the review page (`POST /api/bulk-uploads/[id]/items/[itemId]/contact` → `supplyBulkItemContact()`, validated, LinkedIn stored as the normalized profile URL) and the item runs the normal flow; never preselected; pool batches complete only once none are left. Otherwise `findCandidateMatches`: exact → EXISTING (existing candidate never modified); possible/conflict → NEEDS_DECISION with `parsedSnapshot`; none → NEW via `createCandidateRecord()` (`lib/candidate-create.ts`, shared with POST /api/candidates; email null when the CV has none — never a placeholder; requires email or LinkedIn; sourcedByType RECRUITER + sourcedByUserId/recruiterId = uploader). Same person twice in a batch resolves to EXISTING (DB match / unique constraint retry). Position batches: `alreadyInPosition` or `getOrComputeFitScore` → `fitScore`; no Better match during processing
- Review `/bulk-uploads/[id]` (`BulkUploadReview`): sorted by fit, Same person / Different person for possible duplicates, Retry failed, Cancel batch. Position batches preselect DONE rows with fitScore ≥ `BULK_UPLOAD_PRESELECT_SCORE` (SystemSettings, default 70) not already in the position; "Add N selected to pipeline" (`POST /api/bulk-uploads/[id]/confirm`, only when READY) uses `addCandidateToPosition()` (`lib/candidate-position-create.ts`, shared with POST /api/candidate-positions: APPLIED + StageHistory, recruiter = uploader), writes the cached score (`applyFitResult`), then runs `scoreCandidateForPosition` in the background for Better match; batch → COMPLETED. Pool batches complete once nothing needs a decision
- Notifications: home card for READY batches (uploader; ADMINs see all), `BulkUploadBanner` on the position page (PROCESSING x/N or READY), list page `/bulk-uploads` (linked from /candidates)

## Redeployment

- Delivery-center people released recently / releasing soon and flagged for rehire, from the HR roster Google Sheet + a Drive CV folder (shared with the service account). Called "Redeployment" everywhere; badge "Redeploy" (`components/app/RedeployBadge.tsx`, with `LwdChip`: "Releases in Nd" amber / "Released Nd ago" gray). Never "Internal" (that is recruiter-sourced)
- Schema: `SourceType.REDEPLOYMENT`; `RedeploymentProfile` (rosterId unique, candidateId unique nullable, possibleDuplicateOfId/parsedSnapshot while a decision is pending, minimal roster fields, status ACTIVE | OUT_OF_WINDOW | REMOVED)
- Settings (`lib/redeployment-settings.ts`, seeded without overwriting, /settings): REDEPLOYMENT_SHEET_ID, REDEPLOYMENT_SHEET_TAB (name or numeric gid), REDEPLOYMENT_CV_FOLDER_ID, REDEPLOYMENT_REHIRE_VALUES, REDEPLOYMENT_PAST_DAYS (90), REDEPLOYMENT_FUTURE_DAYS (60), REDEPLOYMENT_LWD_FORMAT (MDY | DMY, default MDY). Last sync summary stored in REDEPLOYMENT_LAST_SYNC (hidden from the form)
- Sync `lib/redeployment-sync.ts` (`runRedeploymentSync`): DATA MINIMIZATION — reads the header row, then batchGets ONLY the 19 mapped columns (RosterID … CV); aborts listing missing headers; never logs rows (only rosterIds). Sheets client `getSheetsClient()` (spreadsheets.readonly), folder listing `listDriveFolderFiles()` (supportsAllDrives + includeItemsFromAllDrives). LWD read in its own batchGet (UNFORMATTED_VALUE + SERIAL_NUMBER: date cells → serial numbers; all other columns FORMATTED_VALUE so phones/IDs keep leading zeros and "+"); text LWD parsed as yyyy-mm-dd or in the order of REDEPLOYMENT_LWD_FORMAT (MDY default, or DMY); unparseable/impossible dates are never guessed: counted as `invalidLwd`, logged "[redeployment] Roster <rosterId>: invalid LWD", no eligibility decision (new rows skipped, known profiles keep status and previous LWD); "today" in Montevideo. CV folder: aborts if REDEPLOYMENT_CV_FOLDER_ID equals GOOGLE_DRIVE_FOLDER_ID (our own CV folder); empty setting → CV lookup skipped (cvMissing). CV column may be an AppSheet path (only the part after the last "/" is matched); exact name first, case-insensitive contains only when it matches exactly one file (else cvMissing, logged as "ambiguous CV match" with the rosterId). The wrong original default (1xnH6…, our own folder) is corrected on seed only while the row still holds it
- Per row: not eligible and unknown → skipped; known → roster fields updated, ACTIVE / OUT_OF_WINDOW (unresolved eligible profiles are retried); new + eligible → `findCandidateMatches` (personal email, then work email; name + phone): exact → linked (candidate never modified, CV kept; roster CV only referenced via sourceCvDriveFileId); possible/conflict (or exact candidate already linked to another rosterId) → pending decision; none → `createCandidateFromProfile()` via `createCandidateRecord()` (source REDEPLOYMENT, preferred name, personal email else work email, work email in notes, roster skills + CV skills, CV uploaded and parsed to fill empty fields; owner = the admin running the sync, else the earliest ADMIN). No email in the roster → error, retried next sync. Missing from the sheet → REMOVED (candidates never deleted)
- Daily cron 06:30 America/Montevideo (`lib/redeployment-cron.ts`, from instrumentation.ts); `POST /api/redeployment/sync` (ADMIN); `POST /api/redeployment/[id]/decide` (same / different)
- UI: sidebar "Redeployment" → /redeployment (`RedeploymentTable`: filters status/timing/skill/needs decision, active pipelines, roster CV, Same/Different person, Add to position via `POST /api/redeployment/add-to-position` (rejects with a clear 409 message unless the position is in `getAssignablePositions(candidateId)`, then `addCandidateToPosition` + `scoreCandidateForPosition`; other add-to-position routes are unchanged); the picker lists only `getAssignablePositions(ForCandidates)()` from `lib/assignable-positions.ts`: not deleted, OPEN, REQUISITION or PROACTIVE ("Proactive" marked), not fulfilled, not already linked to the candidate, sorted by title). Redeploy badge + LWD chip on /candidates, candidate detail (plus a Redeployment card), candidate-in-position header, position candidates table, Find Candidates. Find Candidates includes ACTIVE profiles even without CV skills (roster skills used). Find Candidates scoring: no-AI prefilter ranks by JD skill overlap then position-title words in the latest role (numbers never returned/displayed); `POST /api/positions/[id]/talent-search/score` returns every candidate with a current cached score for free (`getOrComputeFitScore(…, { cacheOnly: true })`) and computes real scores only for the first 15 uncached (5 at a time); the rest come back as `pending` → "Score 15 more" button. No redeployment boost. Reports: Redeployment as its own source (pipeline/account reports, Recruiter Performance activity column). Partner portals never expose any of it

## Global Opportunities & Redeployment Matching (Phase 2)

- Models: `GlobalOpportunity` (requisitionId unique, groupKey, kept rows only), `GlobalOpportunityImport` (counts by discard reason), `OpportunityMatch` (profile × groupKey, status NEW | PROPOSED | DISMISSED)
- Import `/opportunities` (ADMIN + RECRUITER; sidebar "Opportunities"): `POST /api/opportunities/import` → `importGlobalOpportunities()` (`lib/global-opportunity-import.ts`, **exceljs**, not the `xlsx` package): sheet "Base Data", header row 1, only the listed columns (rich text / formula results / date cells handled). Filters (discarded rows are only counted): TID Status ≠ OPEN or Stage "Closed Lost" → other; Offshore → offshore; LATAM country → latam; US + Work From Office → usWfo; keep US Hybrid / Remote / blank ("Unknown") or GLOBAL_OPP_EXTRA_LOCATIONS (default "Canada,Poland"); US with any other work mode → other; other locations → otherLocation (names shown after import); openings = No. Of Position − Total Joined ≤ 0 → other. Upsert by requisitionId; rows missing from the file → active=false (skipped when nothing was kept, i.e. wrong file). groupKey = hash(designation + account + location + workMode + sorted mandatory skills). Screen groups by groupKey (filters location / work mode / skill)
- Matching `lib/redeployment-matching.ts` (`runRedeploymentMatching`, single-flight with one queued rerun): pool = ACTIVE profiles with a candidate; no-AI prefilter (skill overlap ×2 + title words, never shown) keeps the top GLOBAL_MATCH_TOP_N (default 5) groups with prefilter > 0; scoring reuses the fit-score prompt/rubric/model/temperature via `fitPromptAndHash()` + `runFitPrompt()` from `lib/fit-scorer.ts` (group mapped with `groupAsPosition()`); unchanged inputsHash → skipped; re-scoring never touches status/notes; 3 at a time; failures retried next run. Runs after each import, after syncs that create/link/update people, and from "Recompute matches" (ADMIN, `POST /api/redeployment/matching/recompute`)
- "Global matches" tab: `/redeployment?tab=matches` (`GlobalMatchesTab` + `GlobalMatchesView`): grouped by person, filters status (default New + Proposed) / min score (default GLOBAL_MATCH_MIN_SCORE 65) / location; Mark as proposed (optional note) / Dismiss / Reopen via `PATCH /api/opportunity-matches/[id]`
- Monday digest `lib/redeployment-digest.ts`: cron Mondays 08:00 America/Montevideo (in `lib/redeployment-cron.ts`), only to REDEPLOYMENT_DIGEST_RECIPIENTS (empty = not sent), via `sendEmailViaSystemGmail` (same as the pipeline report); pool summary + top 3 matches ≥ min score (NEW/PROPOSED, active groups) per person, "New" = created since REDEPLOYMENT_LAST_DIGEST_AT; "Send test digest to me" (ADMIN, `POST /api/redeployment/digest/test`, does not move the marker; replies "Not sent: <reason>" when nothing went out). Digest uses `trySendEmailViaSystemGmail()` (lib/email.ts, returns `{ sent }` / `{ sent: false, reason }`, never throws); `sendEmailViaSystemGmail()` keeps its old fire-and-forget behaviour for the pipeline report and others. Monday result (sent / partial / skipped + why / error, with date) stored in REDEPLOYMENT_LAST_DIGEST_RESULT, logged as a warning when not sent, shown to ADMINs on the Global matches tab; the "New" marker only moves when at least one email was sent
- Settings (`lib/global-opportunity-settings.ts`, seeded): GLOBAL_OPP_EXTRA_LOCATIONS, GLOBAL_MATCH_TOP_N, GLOBAL_MATCH_MIN_SCORE, REDEPLOYMENT_DIGEST_RECIPIENTS

## Redeployment × TalentOS positions, Find Candidates priority, weighted hires

- `OpportunityMatch.targetType` GLOBAL_GROUP | TALENTOS_POSITION (`positionId`; uniques per profile+groupKey and profile+positionId). Matching also scores each ACTIVE person against `getAssignablePositionsForCandidates()` positions: same no-AI prefilter, top GLOBAL_MATCH_TOP_N, scored with `getOrComputeFitScore` (identical to Find Candidates / add-to-position); unchanged prompt hash → skipped
- Visibility (`lib/redeployment-match-view.ts` `getVisibleMatches()`, shared by tab and digest): position matches only while the position is still assignable to that person; groups only while active. Tab renamed "Matches", per person "TalentOS positions" (Add to position → `POST /api/redeployment/add-to-position`, which also sets the match PROPOSED) then "Global opportunities"; digest has the same two sections, top 3 each
- Re-run triggers: `scheduleRedeploymentMatching()` (60 s debounce, background) on position create, PATCH (status/skills/JD), convert, and after JD parsing
- Find Candidates: ACTIVE redeployment people that pass the prefilter are ranked first (so in the first scoring batch); modal shows a "Redeployment pool" section on top (badge, LWD chip, lime left border), then "Other candidates". No score boost
- `CandidatePosition.redeploymentHire`: set once by `markRedeploymentHire()` (`lib/redeployment-hire.ts`) when a CP becomes hired (stage route, interview-created HIRED stage) and the candidate's profile is ACTIVE/OUT_OF_WINDOW; one-time backfill at startup (marker REDEPLOYMENT_HIRE_BACKFILL with the count). ONLY Recruiter Performance Closures are weighted: count = hires + redeployHires × REDEPLOYMENT_HIRE_WEIGHT (default 2, /settings), shown as "(N hires · M redeploy ×W)" with a tooltip; attainment uses the weighted count. All other hire counts unchanged

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

## Candidate Availability to Start

- Candidate property (not CandidatePosition.startDate, which is a hire's actual start): `startAvailability StartAvailability?` (IMMEDIATE|ONE_WEEK|TWO_WEEKS|ONE_MONTH|TWO_MONTHS|THREE_MONTHS_PLUS) + `availabilityUpdatedAt`
- `lib/start-availability.ts` (client-safe): labels ("Immediate", "1 week", … "3+ months"), `availabilityWriteData()` sets availabilityUpdatedAt server-side only when the value changes (clearing clears both), `availabilityStaleHint()` → "updated Nd ago" when > 30 days. No date calculations: always the label as entered
- Input: CandidateForm, CreateCandidateInPositionForm, vendor/referral portal (`PortalPage`), Zod `z.enum` on POST/PATCH /api/candidates and the portal submit routes (invalid portal value ignored)
- Display (`AvailabilityLabel` component): candidate detail card, candidate-in-position header, Position → Candidates "Availability" column, Tenarai CV "Availability:" line (only when set, no stale hint). Not used in fit scoring

## Fit Scoring Suggestions

- Single source of truth: `getOrComputeFitScore(candidateId, positionId)` (`lib/fit-scorer.ts`). inputsHash = sha256(FIT_PROMPT_VERSION + model + system prompt + cvDriveId + full prompt with candidate profile and position JD/requirements); cached in `FitScoreCache` (unique candidate+position+hash). Same inputs → cached result, no AI call. Every scoring path goes through it (scoreCandidateForPosition, better match, recompute script, future Redeployment matching). Bump `FIT_PROMPT_VERSION` when the prompt/rubric changes
- Real score: SMART, temperature 0, 4-dimension rubric, also returns `strongestRoles`; only the current position is in the prompt
- Better match: candidates = OPEN, REQUISITION or PROACTIVE, not fulfilled, not current, `locationAllowed`, ≥1 skill overlap (max 10, by overlap) → cheap FAST shortlist of max 2 (its output is never shown) → real score via getOrComputeFitScore → kept only if round(real) ≥ round(current fitScore) + `BETTER_MATCH_MIN_DELTA` (SystemSettings, default 8) AND round(real) ≥ floor = suggested position's `vendorMinFitScore` (candidate sourced by VENDOR/REFERRAL) or `directMinFitScore` (DIRECT) when set, else `BETTER_MATCH_MIN_SCORE` (SystemSettings, default 70); both editable in /settings. Rule in `passesBetterMatch()` / `betterMatchFloor()`, shared with the recompute script. Stored on CandidatePosition (`suggestedPositionId/Score/Reason`; reason = suggested position's fitSummary), cleared otherwise
- UI: FitScoreCard shows "Strongest in" chips and "Better match: <real> vs <current> here" (only while that position is OPEN and not fulfilled) with "Add to that position" (POST /api/candidate-positions → cache hit, identical numbers) or "Already in that position"
- Re-score returns the cached result unless the inputs changed
- `scripts/recompute-better-match.ts`: dry run (default) / `--apply` — re-checks stored suggestions against real scores, keeps or clears them

## Home Screen

- `/` renders the daily home for signed-in users (inside `DashboardShell`, shared with the `(dashboard)` layout); visitors keep the landing page. "Home" is the first sidebar item
- Data: `getHomeData()` in `lib/home.ts` (one positions query + one "starting soon" query); UI: `components/app/home/HomeScreen.tsx` (server component)
- Scope: OPEN requisitions, ACTIVE candidates; "Starting soon" = HIRED with startDate in the next 7 days on OPEN or FILLED requisitions; today's interviews include any candidate status
- "Today" in America/Montevideo; business days via `lib/business-days.ts` (shared with Recruiter Performance); thresholds in `lib/home-thresholds.ts`
- Shared: `HcFraction` (○/◐/✓), `lib/stage-labels.ts`
- "Current waiting by stage" (formerly Bottlenecks): Avg so far vs Typical (`getTimeInStage()` from `lib/analytics.ts`, same as /reports Time in Stage); amber when above typical, red when ≥50% above
- Fulfilled = `isPositionFulfilled()` in `lib/position-fulfillment.ts` (hired = status or stage HIRED; null headcount = 1), shared by the home screen, fit-scoring suggestions and reporting-cron (per-position update emails skip fulfilled positions)
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
