# Bulk LinkedIn CV import

Recruiters can open **Import LinkedIn CVs** from the dashboard or an open job. `/candidates/import?job=<id>` preselects that job. Once files are queued, the job is locked until the queue is cleared. The existing emailed-CV route remains available.

1. Select an open role and choose/drop downloaded PDF, DOC or DOCX files (10 MB per file, 25 files and 100 MB per queue).
2. Choose **Start automatic batch**. Files are extracted sequentially through the existing authenticated `/api/extract-candidate` endpoint. Valid records are created without individual approval clicks, then scored through the existing `/api/score-application` flow for that role.
3. Only exceptions need attention: missing name or invalid/missing email, extraction errors, duplicate warnings and failed writes/scoring. Phone and location remain optional; no missing details are inferred. Enter only details stated in the CV, or explicitly retry reading, then resume the batch. Successful extractions are not repeated when resuming.
4. Case/whitespace-normalized email matches are checked within the queue and against applications visible to the recruiter for the same job. Duplicates are held. A warning requires an explicit per-file choice and review to create a separate application; existing records are never merged or overwritten.
5. Each original file is uploaded to the existing private `candidate-cvs` bucket using a new path and `upsert: false`. A saved row is never reimported in the same queue. Failed scoring is retried separately without another CV upload or candidate insert. Before a scoring retry, the saved score is checked; successful scores, including zero, are reused even after a lost response.

The scoring endpoint, rubric and prompts are unchanged. Scoring uses the selected role's title and existing main job description under the current scope-based rubric. No usable description means scoring pauses with an error; the candidate remains imported. Scores remain human decision support. No threshold-based selection, rejection, client movement or Isitha formatting is performed. Formatting stays the existing separate action for candidates a recruiter selects after reviewing scores.

The original manual extraction/review/import controls remain available as a fallback. **Import reviewed & score** handles explicitly reviewed exceptions in one action. **Retry scoring** handles remaining saved candidates only. Keep the tab open while processing; after a refresh, the existing job page's scoring controls can continue work.

Duplicate queries page through all visible results (500 per request) and failures block import. The job's open status and existing applications are checked again before a save pass. Newly discovered matches require renewed review. These checks are advisory, not an atomic database uniqueness guarantee: another recruiter can create an application between the check and insert, and people with different email addresses may be the same applicant. No uniqueness constraint is added, since deliberately creating a separate application remains a recruiter decision.

## Data and access

No migration is required. Each new application records `Source: LinkedIn Easy Apply - manually imported from a downloaded CV.` in the existing `recruiter_notes` field. `popia_consent` remains false and `popia_consent_at` remains null. Only the existing role-scoring flow is connected automatically. No candidate messaging, hiring decision, formatting, LinkedIn scraping, new service, service-role access or policy change is introduced. Existing recruitment session, database RLS and storage permissions continue to apply. Live DB constraints and policies have not been inspected or changed.

A definite database rejection cleans up only the newly uploaded file and retains edits for retry. An ambiguous network/HTTP write response retains the CV and disables that row's retry controls; reconcile the job's candidate list before manually starting a new import. Successful rows remain completed if another file fails. Files and edits are held in the current tab, not persisted as an import session; refreshing/leaving loses unsaved queue entries. Clear queue does not delete saved applications.

## Relationship to PR #64

Bulk import was added in PR #65 from main `575d250`; Brian merged it as `33860aa`. The automatic import/scoring follow-up starts from `33860aa`. PR #64's single-CV form remains independent. Existing job-page scoring and formatting controls are preserved. The new batch orchestration calls the existing score API; it does not modify that API or its criteria.

## Verification

`npm test` runs the existing regression checks plus synthetic importer tests. The suite verifies automatic extraction/import/scoring without per-file review; duplicate/missing/error holds; partial-write recovery; scoring-only retries; zero-score and lost-response reconciliation; missing role descriptions; and the original review, file validation, duplicate, pagination, consent, source and uncertain-write safeguards. AI and Supabase are mocked throughout.

For a production-build browser check using only synthetic services, in PowerShell:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic-public-key'
npm run build
npm run test:browser
```

The browser script starts that local build on port 3100 and intercepts every external request. It uses installed Edge by default; set `PLAYWRIGHT_CHANNEL=chrome` if needed. Desktop (1280px) and mobile (390px) screenshots are generated in ignored `tests/artifacts/`. It verifies automatic extraction/import/scoring, a held duplicate, one original CV upload and candidate record, scoring failure/retry and source/consent fields. It fails on automatic formatting calls, unexpected external requests, page exceptions or mobile overflow. No real CV, production row, candidate email or paid model request is used.

Before real recruiter acceptance, use an isolated non-production database/storage configuration and approved test account to verify the existing deployed permissions and database constraints. Do not perform real writes against production merely to test this PR.
