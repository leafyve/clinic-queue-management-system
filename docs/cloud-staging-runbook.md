# Cloud staging / production readiness

Evidence date: 2026-10-04, Asia/Singapore. The system remains a staging prototype. Synthetic data only; clinicians retain clinical judgment. No diagnosis inference, automatic prescribing or software-driven emergency triage. Emergency priority requires an authorized staff action.

## Environment boundaries

| Class | Data/services | Preview | Secret scope |
| --- | --- | --- | --- |
| LOCAL | Loopback Supabase and developer fixtures | Only with explicit NEXT_PUBLIC_LOCAL_PREVIEW=true and both public credentials absent | Ignored developer files; real WhatsApp adapter refuses LOCAL |
| STAGING | One dedicated hosted Supabase project, dedicated hosted app; developer-controlled recipients | Forbidden | Dedicated staging keys and provider credentials only |
| PRODUCTION | Future separate projects/accounts; not configured in this task | Forbidden | Future independently generated keys; clinic/operator authorization required |

`APP_ENV` and `NEXT_PUBLIC_APP_ENV` must explicitly match LOCAL/STAGING/PRODUCTION. `NODE_ENV=production` only selects optimized execution; it does not select patient data. Next configuration validates at startup/build. Changing a public value requires rebuilding; never promote a build between data environments. Cloud URLs must be the standard HTTPS `<ref>.supabase.co` origin and match the selected explicit project reference. Custom Supabase domains require a later deliberate validation change, not a fallback. Dedicated projects, distinct credentials and access control enforce isolation; labeling an existing production project STAGING cannot prove it is safe.

Only these NEXT_PUBLIC variables are permitted: APP_ENV, LOCAL_PREVIEW, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (all with the NEXT_PUBLIC_ prefix). Public keys must be publishable or legacy anon, never service-role. The URL/key/class are intentionally public; authorization depends on RLS and server checks. Unknown public variable names fail configuration. No privileged credentials in next.config env injection. Clinical key access has moved into a `server-only` module.

Safe reference: [../.env.example](../.env.example). Do not replace existing ignored developer secrets. For local integration use the existing `.env.test.local` and local launcher, which explicitly supplies LOCAL and blanks provider credentials. For a new local setup copy the example into `.env.local`, obtain loopback keys privately from Supabase status, and generate a random 32-byte base64 medical key plus a random worker secret. For a deliberate local preview blank both Supabase public values and set NEXT_PUBLIC_LOCAL_PREVIEW=true; readiness then remains 503.

| Variable | Scope / requirement |
| --- | --- |
| APP_ENV; NEXT_PUBLIC_APP_ENV | Required, matching explicit class |
| NEXT_PUBLIC_LOCAL_PREVIEW | false for configured LOCAL; forbidden true for cloud |
| NEXT_PUBLIC_SUPABASE_URL; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Required configured environment; public project endpoint/publishable key |
| STAGING_SUPABASE_PROJECT_REF | Required STAGING; exact project reference |
| PRODUCTION_SUPABASE_PROJECT_REF | Required only future PRODUCTION; not configured here |
| SUPABASE_SECRET_KEY | Server only; staging service/secret key |
| MEDICAL_DATA_ENCRYPTION_KEY | Server only; base64 32 random bytes, separate per environment and securely escrowed |
| CRON_SECRET | Server only; at least 32 characters of high-entropy secret; worker and detailed health authorization |
| WHATSAPP_ACCESS_TOKEN; WHATSAPP_PHONE_NUMBER_ID | Server only; both or neither; use Meta staging/test resources |
| STAGING_WHATSAPP_RECIPIENTS | Server only; digits in E.164 form without +, comma separated; required with staging provider configuration |
| WHATSAPP_WEBHOOK_VERIFY_TOKEN | Server only; reserved, webhook/delivery-receipt handler is NOT IMPLEMENTED |
| SUPABASE_ACCESS_TOKEN; SUPABASE_DB_PASSWORD | CLI only; never browser or application configuration; scoped staging access |
| STAGING_APP_URL; STAGING_VERIFICATION_CONFIRM | Test tools only; HTTPS origin and dedicated project ref confirmation |
| STAGING_PATIENT_A_PHONE; STAGING_PATIENT_B_PHONE; STAGING_CONTROLLED_PHONES_CONFIRM | Bootstrap only; distinct owned E.164 phones; confirmation developer-controlled |

SMS provider credentials belong in hosted Supabase Auth's protected settings, not NEXT_PUBLIC variables or application logs. Do not copy permissive local Auth settings to cloud. Require strong unique staff passwords, approved session limits, refresh rotation, exact staging redirect URLs, anonymous-sign-in disabled, signup/phone settings deliberate, and existing provider throttles unchanged.

## Dedicated hosted Supabase migration

**BLOCKED — CREDENTIAL REQUIRED** until a project is identified and authenticated. Supabase CLI 2.119.0 is available, but projects listing rejects missing access token. No project has been linked and no hosted DDL executed.

Create/select a new staging project in an authorized developer account, PostgreSQL 17 compatible with local. Confirm name/reference and no real patient data. Do not select the clinic's eventual production account. Authenticate privately with scoped access. Discover CLI flags with `--help`; this session inspected db push/dump and migration list help. Then:

```powershell
npx supabase link --project-ref <dedicated-staging-ref>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked --include-seed
npx supabase migration list --linked
```

Do not use remote db reset, migration repair or ad-hoc hosted schema changes. Review dry-run first. Existing history plus the reserved Storage migration must apply in order: 20260929074652, 20261004050104, 20261004092502. Record actual remote versions and UTC apply time; expected versions are not evidence of applied versions. Seed contains clinic/reference medications only, no patient accounts. Staging bootstrap relabels the seeded clinic STAGING TEST; UI retains the existing clinic branding.

Compare a sanitized schema-only dump for public/private with local, then inspect grants, policies, indexes, exclusions, function definitions/search_path/EXECUTE, Auth trigger, Storage fences and publication membership. Save a catalog inventory separately from data. Verify all 16 public tables have RLS, private schema is unexposed, app roles cannot edit audit logs, owner/clinic boundaries come from database assignments, and no authorization uses user-editable metadata. Four tables must be in supabase_realtime: queue_entries, appointments, clinic_settings, notifications. Only queue/clinic-settings UI subscriptions exist. Compare actual `pg_policies`, `information_schema.role_table_grants`, column privileges, `pg_proc`, `pg_trigger`, `pg_indexes`, `pg_publication_tables` and migration history; counts alone are insufficient for hosted parity.

## Synthetic identities and hosted suite

Set dedicated configuration in ignored `.env.staging.local`, including test-only confirmation and two controlled patient phones. No secret values in docs/source. `npm run bootstrap:staging` creates five `staging-<role>@example.invalid` identities with STAGING TEST names, separate random 32-byte passwords, application users/patients/staff/doctor mappings and notifications disabled. Patient phones start unconfirmed; only a real OTP verifies possession. No local password reuse and no emails sent. Password login in acceptance is not OTP evidence. The ignored manifest contains passwords; apply restrictive OS ACLs (Windows mode 0600 is not an ACL). Do not copy it to deployment output.

Bootstrap refuses an existing manifest or nonempty clinic. Partial bootstrap retains each newly created identity for operator inspection and recovery; it is not crash-atomic. Never blindly rerun, delete users or reset passwords after partial failure. Confirm profile role, is_active, patient user_id/clinic_id, staff user_id/role/clinic_id, doctors.staff_id using admin inspection and actual per-role sessions. Remove bootstrap shell variables after use; operational onboarding/offboarding is an owner decision.

`npm run test:staging` explicitly requires STAGING, matching reference/HTTPS app/manifest, developer fixture-only data, empty active queue and disabled WhatsApp. It never repoints the destructive local suite. It preserves visits/appointments as evidence and ends the remaining test wait through an authorized staff operation. Interrupted runs require inspection before rerun. It exercises hosted password Auth mappings, RLS/SQL denials, API roles, clinical workflow/encryption, two joins/four call-nexts, appointment collision, Realtime and reserved Storage. Maximum concurrent calls: four. Password Auth does not establish SMS behavior or full browser E2E. Hosted browser and provider procedures below remain separate gates. **IMPLEMENTED BUT UNVERIFIED** until run against identified staging.

## SMS OTP controlled acceptance

Existing login uses Supabase signInWithOtp/verifyOtp. Configure a supported provider on staging only once authorized provider credentials and controlled phone ownership are available. No fixed test OTP or disabled rate limit as a substitute for a real-provider gate. Record request status/aggregate error code/timestamps, never OTPs, tokens or full destination values.

For both test patients: request a code, reject one invalid code, accept the correct received code, inspect session and matching patient row, logout, reject protected operations without session, refresh and verify expiry/refresh under configured policy. Where practical let a code expire and show rejection. Repeated requests must throttle under actual hosted rules; do not hammer the provider or loosen settings. Prove the phone identity does not create a second patient linked to a password fixture. **IMPLEMENTED BUT UNVERIFIED** patient OTP architecture; provider configuration and acceptance are **BLOCKED — CREDENTIAL REQUIRED**.

## WhatsApp controlled acceptance

The existing Meta v23.0 adapter uses configured server credentials; no runtime mock switch was added. LOCAL explicitly refuses real transport. STAGING requires controlled digits-only recipient allowlist before network access. Timeout after 10 seconds, malformed acknowledgement, network errors and HTTP 5xx leave processing for reconciliation; definitive rejection enters bounded retry (four attempts). Provider acceptance is recorded as sent with message ID; sent is not proof of handset delivery. Delivery receipt webhook is NOT IMPLEMENTED.

Approve existing queue_called, queue_approaching and appointment_reminder templates/parameter order for the staging test sender. Enable clinic notifications only for a reviewed test, enqueue one synthetic visit per kind and process using the authenticated worker. Verify Meta acceptance IDs privately, transitions, encrypted parameters/destination, scheduling, four-attempt exhaustion, unique visit/kind dedup, two concurrent workers, rejection, simulated timeout and ambiguous/no-ack persistence. Never automatically reset processing to pending: reconcile provider evidence first. Do not output access token, raw provider bodies, full phones or clinical data. Save sanitized aggregate results. Real-provider behavior is **BLOCKED — CREDENTIAL REQUIRED**; adapter exists **IMPLEMENTED BUT UNVERIFIED** on Meta.

## Reserved private Storage

20261004092502 creates clinical-private with public=false, 5 MiB limit and PDF/PNG/JPEG MIME restrictions. Restrictive RLS fences deny every application identity, including admin; only intentional service-role maintenance can upload/read/sign. No upload/download/document-management feature exists. This is a private reservation until a patient/clinic/file authorization model is explicitly approved, not completed clinical-file access. Staff/doctor/admin file authorization and application signed-URL endpoints are **NOT IMPLEMENTED**. Retention is **OWNER/LEGAL DECISION REQUIRED**.

Local test uploads a random UUID/UUID.pdf synthetic object as service role, proves anon and all five app-role list/download/signing denial, creates a 60-second service signed URL, downloads it and removes only that object. Hosted suite repeats this procedure when credentials exist. Never include names, phones, diagnoses or national identifiers in paths. Do not issue signed URLs through an unauthenticated or arbitrary-path endpoint. Existing signed links remain bearer access until expiry; revocation/retention needs policy. Hosted Storage is **BLOCKED — CREDENTIAL REQUIRED**.

## Backup and recovery drill

Supported PostgreSQL/Supabase exports and provider restore workflows must restore into a separate staging-recovery project. Database backups do not recover Storage binaries; Auth/provider settings and encryption secrets require separate secure recovery. [Supabase backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [database backups](https://supabase.com/docs/guides/platform/backups).

1. Confirm source and recovery references are different, empty recovery target, no clinical production data, and operator recovery plan. Disable provider sending and scheduling on recovery throughout.
2. Create known synthetic patient/visit/prescription/audit/private-file fixtures. Record IDs, counts, relationships, ciphertext hashes, migration history and schema/grant/RLS inventory in protected evidence.
3. Produce supported role/schema/data exports using CLI commands verified by --help. Handle Auth and Storage metadata explicitly under provider guidance; store Storage object bytes separately with checksums. Encrypt/access-restrict exports; they contain phone and Auth data even in staging. Record snapshot time and checksum. Securely escrow the environment's encryption key outside PostgreSQL and separately from dump access.
4. Restore using the provider-supported workflow into the recovery target; preserve managed schemas/roles. Reapply grants/owners using the supported procedure, not guessed elevated privileges. No `--clean` on the only staging environment. Stop on errors, retaining evidence and source.
5. Compare records/relationships and exact schema, grants, triggers, policies, indexes and publication. Recover Storage bytes and validate private access. Decrypt known encrypted fixtures using the recovered key, then prove missing/wrong key failure.
6. Link only the disposable recovery app to that project, validate matching environment, repeat authorization, critical workflow and Realtime, and verify Auth/session/provider configuration separately. Keep notification sending disabled to avoid duplicate replay of restored outbox entries. Resolve pending/processing jobs manually under provider evidence.
7. Record measured recovery elapsed time and data-loss window, separate from future agreed targets. Obtain owner decisions on schedule, retention, encryption escrow, restore authorization and drill cadence.

`node --env-file=.env.test.local scripts/verify-local-restore.mjs` rehearses supported PostgreSQL custom-format dump/restore into a newly named database in the existing local container. It checks synthetic-only patients, creates known encrypted visit/prescription relationships, compares counts/catalog/publication/migration history and decrypts a restored value. It never restores over source and retains the safe target. It excludes ACL/ownership and cannot establish hosted grants, managed-service recovery, Storage binaries or live app connectivity to that restored database. **VERIFIED** only to the extent recorded in implementation status. Hosted drill **BLOCKED — CREDENTIAL REQUIRED**. Operational RPO/RTO: undefined.

## Hosted app and scheduling

Vercel is the selected existing target. Live inspection found CLI 61.0.0 installed and logged out; installation is unnecessary now. If absent on another machine, install `npm i -g vercel` to unlock env/deploy/logs. This session's integration categories discovery requested login; it was cancelled. No provider account was provisioned or replaced. Use native host logs and Supabase logs; external telemetry provisioning remains unverified.

Authenticate to the authorized developer Vercel account and select/create a dedicated staging project. Scope public/server variables to the staging project only; do not import its values into the clinic's production project. Pull env only to a new ignored staging file, never over an existing developer file. Review target project and secrets before deploy. Use Node 24 as inspected locally; keep the stack and build command. Keep the clinic's final domain unconfigured. Existing vercel.ts contains the protected worker schedule; verify the chosen account/plan supports its frequency and duration.

Vercel Cron Jobs apply to production deployments of a project, not ordinary preview deployments. A dedicated staging project's production deployment slot can still represent APP_ENV=STAGING, but must be explicitly identified as that developer-only staging target. A preview app alone does not prove scheduled notifications. [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs). Do not promote a staging build to a clinic production project.

After authorized deployment, record actual HTTPS URL/build ID/project/ref. Open it, exercise authenticated workflows and confirm the browser's Auth REST/WebSocket traffic uses the hosted Supabase ref, never localhost. Public GET /api/health checks configuration, Auth and PostgREST, returns only ok/unavailable with 200/503 and no-store. Bearer CRON_SECRET adds environment/project ref, provider configuration (not provider availability), exhausted/uncertain notification counts. Health does not prove Realtime, scheduler or Meta delivery. Inspect actual host invocation history. **BLOCKED — CREDENTIAL REQUIRED** until authentication and project selection exist.

## Monitoring and failure runbook

Safe structured events: api_failure, auth_failure, notification_retry, notification_uncertain, notification_worker and health_failure. Only fixed event names, bounded counts and allowlisted SQLSTATE-like codes; no request bodies, identities, phone numbers, OTPs, provider tokens or clinical plaintext. API messages stay generic and conflict/authorization errors remain 409/403. Client failures preserve clinical input, release busy controls, show uncertainty and never auto-replay writes. An app error boundary offers retrying a read and warns about prior actions. Realtime failure banners mark stale data; reconnection refreshes server state. Hosted aggregation, dashboards, alert routes, uptime probes and ownership are **IMPLEMENTED BUT UNVERIFIED** for available event sources / **NOT IMPLEMENTED** for a provisioned alerting integration.

| Incident | Inspect / safe action |
| --- | --- |
| Supabase/DB unavailable | Health DB/Auth checks, host errors, Supabase API/Postgres status/logs, pool connection limits and grant changes. Avoid logging raw SQL arguments. Pause demonstrations; no preview fallback. Check committed state before repeating writes. |
| WhatsApp failing | Aggregate retry/uncertain counts, worker logs/schedule, token expiry, approved templates, Meta status and sanitized provider acceptance IDs. Disable further staging delivery while investigating; never blindly replay processing jobs. |
| Queue processing failing | API status/SQLSTATE, transactional RPC/grants, locks, clinic pause/doctor availability and realtime subscriptions. Do not manually rewrite queue states/numbers or invoke inference-based emergency priority. |
| Background job failing | Vercel invocation history, frequency/plan, CRON_SECRET configuration, 401/500 responses, enabled-clinic outbox counts and exhausted attempts. Health's scheduler hint is not a heartbeat guarantee. |
| Encryption configuration missing | Health503/generic clinical failure, server secret scope/base64 length/environment mismatch. Restore authorized escrowed key; never generate a replacement for existing ciphertext or persist key into database/client. |
| Authentication failing | Aggregate Supabase Auth error/rate-limit logs, exact redirects and verified session/role mappings. Do not log OTPs/tokens or decrease throttle to pass a test. |
| Realtime/client offline | Display stale-data warning, preserve input, reconnect then fetch current visit/queue state. Never automatically resend a clinical completion that might have committed. |

Provider SDK/platform logs need separate PII/PHI retention and access review; finite app events do not certify all third-party logging. Key rotation is an eventual requirement: versioned ciphertext/key identifiers, secure old-key escrow, migration/re-encryption validation and recovery drill must be designed/approved before rotation. No speculative rotation performed.

## Hosted acceptance evidence checklist

Repeat actual SQL/RPC allowed/denied tests and server API authorization for all five roles. Record status/error codes, not just hidden buttons. Patient A own data allowed, B clinical/queue/appointment/history denied, privilege/priority changes denied; receptionist queue allowed but clinical/admin denied; doctor clinical allowed and admin denied; admin intended settings/audit allowed, immutable audit write denied. Include foreign-clinic and inactive/unassigned user cases from local suite as additional hosted manual regressions.

Exercise browser Patient → login → remote join → unique number → Realtime → receptionist call → doctor start → clinician-entered synthetic note/prescription → complete → completed queue → intended patient history/print. Check reception controls and admin settings separately. Password flows and API-driven workflow are distinct from phone OTP and browser E2E evidence.

At 390/768/1440px inspect principal public/login/queue/appointments/reception/doctor/admin/history/prescription pages under correct roles; measure body/document overflow and capture synthetic screenshots. Record console errors, failed requests, redirects, protected routes and actual hosted Auth/WebSocket destinations. Never describe loopback browser evidence as hosted.

Exercise controlled Supabase read failure, disconnected Realtime, provider unavailable/timeout, missing key, malformed ciphertext, duplicate worker processing, lost Auth, queue pause while waiting and doctor completion during client outage. Preserve text and inspect DB before retry. Use browser request interception/temporary separate fault-test instances rather than disabling another operator's database. Hosted failures remain unverified until exercised there.

## Owner/legal/operations gap register

All entries below are **OWNER/LEGAL DECISION REQUIRED**; no legal compliance claimed or policies invented.

| Decision | Responsible party / required artifact |
| --- | --- |
| Purpose, lawful use, consent and patient notices | Clinic owner / legal; approved purpose/notice/consent and withdrawal process |
| Patient identity verification, minors/guardians, correction/access requests | Clinic operations / legal; approved verification and records-correction workflows |
| Staff roles, least privilege, onboarding/offboarding, device/session access | Owner / security operator; access matrix, training, review and revocation procedure |
| Clinical/Storage/notification retention, deletion and legal holds | Owner / legal; approved periods and deletion/recovery boundaries |
| Audit and backup retention, escrow, restore permission/cadence, RPO/RTO | Owner / operator; targets plus measured recovery drill |
| Breach/incident response, escalation and reporting | Owner / legal / operator; response contacts, procedure and responsibilities |
| Provider agreements and cross-border storage/processing | Owner / legal; Supabase, hosting, SMS and Meta agreements/regions/subprocessors |
| Support, downtime, emergency fallback and clinical safety | Owner / clinicians / operator; manual clinic workflow, support hours and accountability |
| Production security review, penetration testing, monitoring and release signoff | Owner / security operator; independent review, alerts, accepted risks and rollout authorization |

GO/NO-GO decisions and current evidence are in [implementation-status.md](implementation-status.md). A cloud-blocked gate cannot be satisfied by local or implementation-only evidence.
