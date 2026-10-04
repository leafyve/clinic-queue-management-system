# Jo-Lin Care architecture

## Product boundary

The first release supports one clinic and one active doctor while keeping every operational row scoped by `clinic_id`. This makes a future multi-outlet release possible without weakening the first release's access rules.

## System shape

```text
Patient / Reception / Doctor / Admin
                  |
          Next.js App Router
       pages + route handlers + RBAC
          |                  |
 Supabase Auth/Postgres   WhatsApp adapter
    RLS + Realtime       Meta Cloud API
```

- Supabase Auth uses mobile OTP for patients and email/password for staff.
- Server-rendered routes validate the authenticated user and staff assignment. RLS independently enforces row ownership and clinic membership.
- Operational commands use route handlers and transactional PostgreSQL functions. A clinic advisory lock serializes remote/walk-in admission, call-next, queue actions and consultation completion. Repeated call-next returns the existing called/in-consultation patient. Number allocation uses a transactional daily counter; appointment overlaps use a PostgreSQL exclusion constraint.
- Supabase Realtime invalidates patient, reception and doctor queue views. Patient RLS hides other patients' queue rows; changes also update public operational `clinic_settings.updated_at` as a privacy-safe invalidation signal. Views refresh again on a late PostgreSQL subscription acknowledgement. Realtime appointment and notification UI subscriptions are not implemented.
- Consultation notes/diagnosis, patient allergies/emergency contact, medical-record content when supplied through the encryption utility, and notification destinations/template parameters use AES-256-GCM. Demographics, chief complaints, appointment reasons and prescription directions remain plaintext relational fields: this is not whole-database encryption.
- WhatsApp delivery uses a protected outbox worker with atomic claims and unique visit/template deduplication. Definitively rejected sends retry at most four attempts. Uncertain delivery or failed persistence after an acknowledgement remains `processing` for manual reconciliation, not automatic replay. Provider delivery is not production-verified. Appointment booking and admin invitation/settings still involve multiple service writes; crash-atomicity of those entire workflows is not established.

## Queue model

The single called/in-consultation patient is first. Remaining active entries sort by emergency, urgent, normal; waiting before skipped within each priority; then joined time, daily sequence and ID as a deterministic final tie-breaker. Completed, cancelled and left entries are excluded. Emergency marking preserves the sequence and adds `-E` to the existing number once; it does not preempt an active consultation.

The predictor uses the most recent 30 completed consultation durations for this clinic:

1. Keep finite durations between 1 and 180 minutes. With fewer than three usable values, use the existing 12-minute fallback.
2. With five or more values, remove one minimum and one maximum. Take and round the arithmetic mean of the remaining values. There is no median or ML model.
3. Let `a` be the nonnegative integral count ahead, `m` the computed mean, and `e` actual minutes elapsed since `consultation_started_at` (not queue join). Without a current consultation, wait is `a*m`. With one counted ahead, wait is `max(0,m-e) + max(0,a-1)*m`; with zero ahead it is zero.
4. Pause or doctor unavailable returns `null` with its reason, never a fabricated number. No active own ticket also returns `null`. Invalid/nonfinite/negative estimator inputs are bounded. Completion records actual start/end timestamps and ceil-duration for subsequent estimates.

The appointment UI's existing grid is 08:30–11:15 Singapore time in 15-minute increments, excluding Sundays. Verification did not introduce afternoon, holiday, cancellation or appointment-to-queue check-in rules. Completing an already linked queue visit updates its appointment to completed; creating that link is not an implemented patient check-in flow.

## Security and PDPA posture

- Least-privilege SQL grants plus RLS on every public table.
- Staff authorization comes from database rows, never editable user metadata.
- Audit logs record operational actions without copying clinical content.
- No service key reaches the browser. Rate limiting uses a server-only PostgreSQL function.
- Data minimisation, purpose limitation, access logging, retention review, breach response, and a documented data-protection owner are deployment requirements.
- This prototype is not a medical device and must undergo Singapore legal, clinical, security, and PDPA review before handling real patient data.

### Cloud staging boundaries

Explicit matching APP_ENV/NEXT_PUBLIC_APP_ENV selects LOCAL, STAGING or PRODUCTION. Startup/build validates project origin/reference and server secrets; only deliberate LOCAL preview can omit Supabase. Clinical key access is server-only. The health endpoint probes Auth/PostgREST without exposing data; protected diagnostics show aggregate outbox failure counts, not proof of provider/scheduler availability. Cloud sending has a staging recipient allowlist and bounded timeout; ambiguous delivery remains contained for reconciliation.

The reserved clinical-private Storage bucket has restrictive denial policies for all app roles, including admin. Service-role maintenance alone may access it. No document workflow or application file authorization exists. Recovery, hosted acceptance and unresolved operator/legal decisions are documented in [cloud-staging-runbook.md](cloud-staging-runbook.md); local evidence never substitutes for hosted verification.

## Visual system

The interface borrows from a familiar neighbourhood clinic queue slip and reception board, not hospital enterprise software.

- Ink `#12372D`, clinic teal `#137C6B`, leaf `#DDF0E8`, paper `#F8FAF7`, coral `#E66A4E`, muted `#61736D`.
- Public pages use `Newsreader` for reassuring display text and `Atkinson Hyperlegible` for highly legible controls and data.
- Queue numbers are the one bold visual device. Everything else is quiet, left-aligned, and roomy.
- Minimum 44px touch targets, visible focus rings, plain-language status copy, and no decorative motion.

## Responsive layout

```text
1440px:  [nav] [message + actions] [live queue board]
 768px:  [nav] [message]           [queue board]
 390px:  [compact nav]
         [message]
         [primary action]
         [queue board]
```
