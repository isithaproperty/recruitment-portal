# Recruitment email setup

The recruitment portal sends transactional email through the server-only `RESEND_API_KEY` environment variable.

## Vercel environment variables

- `RESEND_API_KEY` — required, server only. Never prefix with `NEXT_PUBLIC_`.
- `RECRUITMENT_NOTIFICATION_EMAIL` — optional internal notification destination. Defaults to `recruitment@isithaproperty.co.za`.

## Sending identity

The API route currently sends from `Isitha Global Recruitment <recruitment@isithaproperty.co.za>`. The `isithaproperty.co.za` domain must remain verified in the Resend team containing the recruitment portal API key.

## Notifications

The route supports:

- client submission emails containing the private review link;
- new candidate application notifications to Isitha;
- client CV decision notifications to Isitha;
- interview feedback/outcome notifications to Isitha.

Client submission sends require a valid signed-in Supabase session. The Resend key is read only on the server and is never returned to the browser.
