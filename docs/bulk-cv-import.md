# Bulk LinkedIn CV import

Recruiters can open **Import LinkedIn CVs** from the dashboard or an open job. `/candidates/import?job=<id>` preselects that job. Once files are queued, the job is locked until the queue is cleared. The existing emailed-CV route remains available.

1. Select an open job and choose/drop downloaded PDF, DOC or DOCX files (10 MB per file, 25 files and 100 MB per queue).
2. Choose **Read queued CVs**. Files are extracted sequentially through the existing authenticated `/api/extract-candidate` endpoint. A failed extraction retains the original file and allows manual entry or an explicit retry.
3. Check each candidate's name, email, phone and location. Name and a valid email are required. Mark each application as reviewed.
4. Review duplicate warnings. Case/whitespace-normalized email matches are checked within the queue and against applications visible to the recruiter for the same job. A warning requires an explicit per-file choice to create a separate application; existing records are never merged or overwritten.
5. Import the reviewed applications. Each original file is uploaded to the existing private `candidate-cvs` bucket using a new path and `upsert: false`. A successful row is never retried in the same queue.

Duplicate queries page through all visible results (500 per request) and failures block import. The job's open status and existing applications are checked again before a save pass. Newly discovered matches require renewed review. These checks are advisory, not an atomic database uniqueness guarantee: another recruiter can create an application between the check and insert, and people with different email addresses may be the same applicant. No uniqueness constraint is added, since deliberately creating a separate application remains a recruiter decision.

## Data and access

No migration is required. Each new application records `Source: LinkedIn Easy Apply - manually imported from a downloaded CV.` in the existing `recruiter_notes` field. `popia_consent` remains false and `popia_consent_at` remains null. No scoring, candidate messaging, rejection, LinkedIn scraping, new service, service-role access or policy changes are introduced. Existing recruitment session, database RLS and storage permissions continue to apply. Live DB constraints and policies have not been inspected or changed.

A definite database rejection cleans up only the newly uploaded file and retains edits for retry. An ambiguous network/HTTP write response retains the CV and disables that row's retry controls; reconcile the job's candidate list before manually starting a new import. Successful rows remain completed if another file fails. Files and edits are held in the current tab, not persisted as an import session; refreshing/leaving loses unsaved queue entries. Clear queue does not delete saved applications.

## Relationship to PR #64

This branch starts from main `575d250`, independently of draft PR #64 (`ef1292d`). It adds a separate component and route and preserves the original single-CV upload. PR #64's job-embedded single-CV form remains useful and is neither superseded nor required. The bulk-import link is in the job's action bar, away from PR #64's single-CV section. A Git merge-tree check against that exact PR head verifies that both changes can be combined without conflicts. Neither pending branch has been merged.

## Verification

`npm test` runs the existing synthetic regression checks plus the importer tests. The importer suite exercises multi-file selection/drop, invalid and repeated files, batch limits, extraction/manual fallback, failed duplicate queries and recovery, within-batch/existing/new duplicates, explicit override, partial failures/retry retention, uncertain writes, closed jobs, pagination, consent and source attribution. AI and Supabase are mocked throughout.

For a production-build browser check using only synthetic services, in PowerShell:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='synthetic-public-key'
npm run build
npm run test:browser
```

The browser script starts that local build on port 3100 and intercepts every external request. It uses installed Edge by default; set `PLAYWRIGHT_CHANNEL=chrome` if needed. Desktop (1280px) and mobile (390px) screenshots are generated in ignored `tests/artifacts/`. The check verifies job preselection/locking, multiple files, extraction, duplicate warning/review gating, edits, source/consent fields and the original file payload. It fails on unexpected external requests, page exceptions or horizontal mobile overflow. No real CV, production row, candidate email or paid model request is used.

Before real recruiter acceptance, use an isolated non-production database/storage configuration and approved test account to verify the existing deployed permissions and database constraints. Do not perform real writes against production merely to test this PR.
