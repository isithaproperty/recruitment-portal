# Email route integration points

Call `sendRecruitmentEmail` from `lib/email.ts` after the underlying database action succeeds.

- `app/client-submissions/page.tsx`: after submission candidates are linked, send `client_submission` to the selected client's `contact_email` with the generated `/client-review/<token>` URL.
- `app/apply/[slug]/page.tsx`: after the application insert succeeds, send `application_received` with candidate and job names.
- `app/client-review/[token]/page.tsx`: after `submit_client_cv_review` succeeds, send `client_decision`; after `submit_client_interview_feedback` succeeds, send `interview_feedback`.

Email failure should not roll back a successfully saved recruitment action. Surface a warning to staff where appropriate and retain the saved portal data.
