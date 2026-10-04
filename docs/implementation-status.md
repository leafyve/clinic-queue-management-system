# Implementation status — local integration/security verification

Evidence date: **2026-10-04, Asia/Singapore**. Scope was verification and fixes to defects in the existing application, not redesign or new product functionality. No deployment, commit, push, real patient data, production SMS/WhatsApp credentials, or weakened Docker/Auth/RLS/encryption settings.

**VERIFIED** means exercised on this local stack, including the optimized Next.js production build running on loopback. It does not mean production/hosted-provider readiness.

## 1. Git status before and after

HEAD: 26567e68c4d1e8098e6729e5a2444235c296c0b4. The checkout was already dirty; nothing was staged or committed.

Before:

~~~text
 M README.md
 M next.config.ts
 M package-lock.json
 M package.json
 M src/app/globals.css
 M src/app/layout.tsx
 M src/app/page.tsx
?? components.json
?? docs/
?? scripts/
?? src/app/admin/
?? src/app/api/
?? src/app/appointments/
?? src/app/doctor/
?? src/app/login/
?? src/app/prescriptions/
?? src/app/queue/
?? src/app/records/
?? src/app/staff/
?? src/app/unauthorized/
?? src/components/
?? src/lib/
?? src/middleware.ts
?? src/test/
?? supabase/
?? vercel.ts
?? vitest.config.mts
~~~

After: the same entries remain, plus modified .gitignore. New verification files are inside already-untracked directories. Existing unrelated changes in next.config.ts, homepage, layout, global styles and the original migration/seed/config were preserved. The HEAD diff contains prior product work and is not a this-turn-only diff.

## 2. Files created or updated by this verification

| Area | Files |
| --- | --- |
| Workflow / dependency scope | .gitignore; package.json; package-lock.json; scripts/bootstrap-local.mjs; scripts/run-local-app.mjs; scripts/verify-missing-key.mjs; scripts/verify-client-bundle.mjs |
| Database | supabase/migrations/20261004050104_integration_security_fixes.sql |
| Auth / security / cache | src/lib/auth/session.ts; src/lib/auth/redirect.ts; src/lib/auth/redirect.test.ts; src/lib/http/api.ts; src/lib/supabase/middleware.ts |
| Queue / clinical / analytics | src/lib/clinic/types.ts; src/lib/data/queue.ts; src/lib/data/clinical.ts; src/lib/data/analytics.ts; src/lib/queue/estimate.ts; src/lib/queue/estimate.test.ts; src/lib/security/encryption.test.ts; src/lib/appointments/slots.ts |
| Notifications | src/lib/notifications/outbox.ts; src/lib/notifications/worker.ts; src/lib/notifications/whatsapp.ts |
| Existing APIs | src/app/api/queue/route.ts; src/app/api/queue/actions/route.ts; src/app/api/appointments/route.ts; src/app/api/consultations/route.ts; src/app/api/walk-ins/route.ts; src/app/api/auth/signout/route.ts; src/app/api/notifications/process/route.ts |
| Existing pages | src/app/queue/page.tsx; src/app/staff/page.tsx; src/app/doctor/page.tsx; src/app/records/page.tsx; src/app/prescriptions/page.tsx; src/app/prescriptions/[id]/print/page.tsx |
| Existing forms / views | src/components/login-form.tsx; src/components/booking-form.tsx; src/components/queue-live.tsx; src/components/staff-queue-console.tsx; src/components/doctor-console.tsx; src/components/workspace-header.tsx; src/components/site-header.tsx |
| Tests / docs | src/test/integration.test.ts; README.md; docs/architecture.md; docs/implementation-status.md |

The original 20260929074652 migration was not rewritten. No large testing dependency was added. shadcn's CLI/CSS package was moved to development/build dependencies and its lockfile classification refreshed; no forced dependency upgrade or advisory suppression.

## 3. Local identities and recreation

| Role | Fake email | Verified mapping |
| --- | --- | --- |
| Patient | local-patient@example.invalid | auth.users → users(patient) → patients |
| Second patient | local-other_patient@example.invalid | Separate ownership-denial identity |
| Receptionist | local-receptionist@example.invalid | auth.users → users(receptionist) → staff(receptionist) |
| Doctor | local-doctor@example.invalid | auth.users → users(doctor) → staff(doctor) → doctors |
| Admin | local-admin@example.invalid | auth.users → users(admin) → staff(admin) |

Bootstrap requires exact loopback API/database URLs and the Jo-Lin seed, generates random local credentials and maps fake profiles. It also restores the named fixtures' clinic assignments after an interrupted test. Credentials/key/worker secret are saved only in ignored .local-verification/identities.json and .env.test.local. The suite creates 16 additional fake authenticated patients (local-concurrency-0…15@example.invalid), fake walk-ins and local invitations. Names start LOCAL TEST.

Recreate on a **disposable local** database:

~~~powershell
npx supabase db reset
npm run bootstrap:local
npm run dev:local-test
# Second terminal:
npm run test:integration
~~~

For production-mode checks, supply .env.test.local values to the build process without printing them, run npm run build, stop dev, then npm run start:local-test and the same suite. Follow with:

~~~powershell
node --env-file=.env.test.local scripts/verify-missing-key.mjs
node --env-file=.env.test.local scripts/verify-client-bundle.mjs
~~~

The launcher binds 127.0.0.1:3100, rejects non-loopback Supabase and blanks WhatsApp credentials even if another dotenv file supplies them. No SMS provider is enabled. Patient browser verification used the existing password tab with /login?next=/queue or /records: **real local password Auth verified, not phone OTP/SMS delivery**. Never copy local credentials/test configuration to production.

## 4. Actual RLS and authorization

Every role used a real local Supabase session/JWT, PostgREST and authenticated SQL RPCs. All **16 public tables** retain RLS.

| Role | VERIFIED allowed | VERIFIED denied |
| --- | --- | --- |
| Patient | Own permitted name/DOB updates; own queue/appointment reads; own consultation, medical-record, prescription/item and notification reads; authorized history decryption/print | Other patient exact-row reads: HTTP 406 / PGRST116. Clinical IDOR API: 403. Staff/doctor directory empty; exact-row request 406. Protected role/active/clinic/user/allergy/clinical/queue-priority writes: 42501. Staff/admin API: 403. Rate-limit/outbox privileged SQL: 42501 |
| Receptionist | Same-clinic operational profiles and queue; walk-in, call/recall/skip/complete, emergency, pause/resume; appointment reads | Clinical field writes: 42501; consultation/medical-record rows: 406; clinical/admin API: 403. Missing or mismatched users/staff assignment: API 401 and privileged SQL 42501 |
| Doctor | Same-clinic treatment history/decryption, consultation start/completion, transactional prescription creation and authorized print | Admin-only API 403; wrong queue/patient pairing and foreign-clinic clinical IDOR 403 |
| Admin | Local invitation/mapping, notification settings, own-clinic analytics and audit reads | Normal application-role audit update/delete: 42501; other roles denied admin operations |

Inactive accounts fail closed. Editable Auth metadata cannot grant roles. Reception cannot read foreign-clinic user identities; foreign-clinic admin analytics do not expose Jo-Lin reception identities. Patient queue responses omit other patients' IDs/names. A broad clinic Realtime subscription receives only the patient's own queue row, plus privacy-safe public operational invalidation.

## 5–8. Patient, reception, doctor and admin E2E

**Patient — VERIFIED locally:** password login → remote admission 201 → unique ticket → current/Realtime queue → reception call → doctor start → encrypted notes/diagnosis and prescription → completed ticket → own visit history, prescription and print. Repeated completion does not duplicate a consultation. Unknown/foreign prescription IDs return 404 instead of an unrelated fallback.

**Reception — VERIFIED locally:** walk-in, remote admission, call-next, recall, skip, complete, emergency, pause/resume through APIs; browser registration/call/skip/recall/emergency/pause/resume also exercised. Current-patient actions stay available after call-next. Emergency adds -E once without changing the existing sequence/number or preempting an active consultation. Pause gives null wait and call-next 409; resume restores operation.

**Doctor — VERIFIED locally:** actual current patient/profile/allergy/history data, persisted start, transactional completion/prescription, bad-medication rollback and duplicate-completion protection. Browser completion advances to a different patient with empty notes/medication/form fields without reloading. Authorized historical notes are verified through the doctor API; the sidebar presently displays visit count, not a full historical-note viewer.

**Admin — VERIFIED locally:** real login, overview/staff/settings/audit views, local invitation/role mapping and setting update with audit. Browser saved notifications disabled; no provider credentials. Invitation acceptance/production email and staff edit/deactivation UI were not verified or added.

Every recorded patient ticket retains its number/sequence through waiting → called → in_consultation → completed. Reception evidence includes waiting/emergency → called → skipped → called → completed and another ticket called after resume. Exact fake IDs/state transitions are generated in ignored .local-verification/transitions.json.

## 9. Concurrency — VERIFIED

- 16 independently authenticated fake patients simultaneously join remotely: 16 entries, 16 unique numbers, contiguous sequences, no lost row.
- Identical joined timestamps still select the lowest sequence deterministically.
- 12 simultaneous call-next RPCs select one ID and leave one called patient.
- Four same-patient remote HTTP submissions produce one 201 and remaining 409, one active ticket.
- Four identical walk-in submissions produce one patient/ticket; transactional matching uses name/contact/DOB, not shared phone alone.
- Capacity-one simultaneous admissions produce one success/one conflict. Counter crossing 999 produces A1000 without truncation.

These guarantees have real-database automated coverage, not cross-region/failover evidence.

## 10. Wait prediction — VERIFIED

Unit tests and controlled PostgreSQL history cover zero/one/multiple ahead, historical averaging, emergency insertion, actual consultation elapsed time, skipped/completed patients, pause/resume and unavailable doctor. History [4,10,11,12,13,30] gives 12 minutes after trimming one minimum/maximum. Zero ahead gives 0; one emergency ahead gives 12; five elapsed consultation minutes gives 7 remaining; pause/unavailable doctor gives null; completion gives 0. Negative/nonfinite inputs do not yield negative/nonfinite estimates.

The exact algorithm in docs/architecture.md uses the latest 30 durations, finite 1–180-minute values, 12-minute fallback below three values, trimmed arithmetic mean at five or more, and the current consultation counted only once. It is not median-based, manually entered, or ML.

## 11. Appointments — VERIFIED within existing rules

Booking returns 201; conflict 409; simultaneous same-slot requests one 201/one 409, backed by a PostgreSQL exclusion constraint. Availability excludes occupied slots without personal information. Off-grid input returns 400. Own SQL read succeeds; other patient read 406; protected status write 42501. Reminder payload/time is checked.

Completing a fixture queue visit already linked to an appointment marks it completed. Cancellation/reschedule and appointment-to-queue linking/check-in endpoints do not exist and were not invented. Existing 08:30–11:15 Singapore / 15-minute / no-Sunday grid retained; holiday/afternoon scheduling is not implemented.

## 12. Encryption at rest — VERIFIED with explicit scope

Raw PostgreSQL notes/diagnosis, patient allergy and synthetic medical-record content contain authenticated v1 ciphertext, not supplied plaintext. Authorized patient/doctor paths decrypt expected clinical text. Notification destinations/parameters are encrypted and decrypt for mock delivery.

Wrong/missing key and malformed/tampered ciphertext are tested; corrupt clinical text shows Encrypted record unavailable. A separate optimized keyless app on loopback 3101 rejects unauthorized requests first (401), then authorized clinical read/write and worker with 500. Clinical count and notification state/attempts remain unchanged; that process is terminated. Unauthorized clinical access fails explicitly.

This is not whole-database encryption. Demographics, chief complaints, appointment reasons, medication/directions and relational metadata remain plaintext by the existing schema. Storage/key rotation/managed-disk/backup encryption are not production-verified.

## 13. Notification outbox — VERIFIED with mocked transport only

Called/approaching/reminder rows, parameter order, encrypted payloads and reminders 24 hours before appointments are verified. Repeated call-next/concurrent approaching enqueues do not duplicate templates. Concurrent atomic worker claims send once in the mock; future jobs remain unclaimed. Four definitive rejections exhaust bounded retries with sanitized errors. An ambiguous accepted/connection-loss outcome remains processing for reconciliation and is not replayed. Disabled settings prevent claims. Worker rejects absent secret 401 and accepts the local secret with notifications disabled (200, zero sends).

No real WhatsApp message was sent. External exactly-once delivery, approved templates, status webhooks, hosted cron and reconciliation procedures remain unverified. Appointment booking/admin workflows still involve multiple service writes; their complete crash-atomicity is not established.

## 14. Audit logs — VERIFIED for exercised actions

Actual records cover emergency, pause/resume, remote/walk-in admission, call/start/skip/recall/complete, clinical reads, consultation completion, prescription creation, staff invitation and notification settings. Normal application roles cannot edit/delete audit rows. Local Auth login audit events exist. Audit metadata does not copy diagnosis/notes.

Tamper-resistant retention/export, security-denial logging and fault-injected audit coverage of every operation are not established.

## Diagnosed defects and narrow fixes

| Evidence | Fix / verification |
| --- | --- |
| Patient protected updates succeeded; directory/foreign-user access too broad | Column grants, scoped RLS, active/assignment checks; explicit SQL/HTTP negatives |
| Clinical queue/patient mismatch returned 201 | Authenticated atomic transaction; 403 IDOR, invalid medication rollback |
| Concurrent calls selected multiple patients | Advisory lock and active-slot ownership; 12 calls / one selected |
| Replayed walk-in created four patients/tickets | Transactional admission/audit; four submissions / one patient/ticket |
| Rate SQL had ambiguous key_hash; caller-controlled IP scope | Named conflict constraint, verified-user buckets; sixth forged-IP request 429 |
| Booking collision/availability incomplete | Existing grid validation, availability query and exclusion constraint |
| Wait double-counted current service / used queue join time | Actual consultation start and remaining-current formula |
| Queue response privacy / cold CDC readiness gap | Redacted patient response, safe settings invalidation and acknowledgement refresh |
| GET logout, unsafe next redirect, fallback print/demo clinical data | Same-origin POST logout, internal-only redirects, exact-ID/404 and actual selected data |
| Origin guard ignored scheme | Host/protocol guard; cross-site and cross-scheme POST 403 |
| Next patient inherited clinical form text | Keyed patient console; browser transition confirms blank next form |
| Uncertain delivery retried / error details logged | Atomic claims, bounded definitive retries, uncertainty reconciliation, sanitized errors |
| Fixed reception date / unconditional mobile Open today | Actual Singapore date and non-claiming clinic-hours copy |
| Build CLI treated as runtime dependency | Correct dependency classification; production audit clean, dev findings disclosed |

Repository review covered every relevant API/helper: server auth, IDOR, mass assignment, parameterized SQL, redirects, OTP abuse controls, user-bound rate limiting, origin protection, logs and patient cache exposure. Server clients remain server-only; publishable keys operate under RLS. Auth/provider/rate settings were retained. Protected production pages are dynamic and patient/API responses private/no-store. Scanning 44 client assets found none of the supplied service-role, encryption or worker-secret values. This is not a penetration-test/compliance certificate.

## 15–20. Command evidence

| Check | VERIFIED result |
| --- | --- |
| npm test | Exit 0: 33 unit tests / six files passed; 23 integration tests intentionally skipped in ordinary unit mode |
| npm run typecheck | Exit 0: no TypeScript errors |
| npm run lint | Exit 0: zero warnings/errors |
| npm run build | Exit 0: optimized Next.js 15.5.26/Turbopack, all 23 routes; local environment supplied without logging values |
| npm audit --omit=dev | Exit 0: zero production vulnerabilities |
| npx supabase db reset | Exit 0: 20260929074652 and 20261004050104 migrations applied, Jo-Lin seed loaded; followed by bootstrap/integration tests |
| npm run test:integration | Exit 0: all 23 real local integration/security tests against optimized app |
| verify-missing-key.mjs | Exit 0: keyless HTTP failures, no clinical write or notification claim |
| verify-client-bundle.mjs | Exit 0: 44 client assets, no supplied server-secret values |

Full npm audit still exits 1 with **eight high-severity development-tool findings**, through braces/glob consumers. No forced/breaking upgrade or suppression was applied. One additional Windows Vitest run exited unexpectedly with native worker code 3221226505; isolated and full subsequent reruns passed. Its underlying runner cause is not established.

Browser verification covered queue, appointment confirmation, reception, doctor, records, prescriptions and admin at **390, 768 and 1440px**. Measured body/document width never exceeded viewport width. Real browser actions exercised booking, remote admission, reception controls, doctor completion/form isolation, patient history/prescription and admin settings. Ignored browser-layouts.json and synthetic screenshots record evidence. Not a full accessibility/device/browser certification.

Docker client/server are 29.6.2. Local PostgreSQL/Realtime/Auth containers healthy; Auth health HTTP 200. Supabase Analytics remains intentionally disabled; insecure Docker port 2375 was not enabled. Startup recovery reversibly preserved transient Docker runtime and secrets-engine folders as dated local backups; no images/volumes factory-reset. Requested database resets cleared disposable local fixtures; bootstrap recreated them.

## 21. IMPLEMENTED BUT NOT PRODUCTION-VERIFIED / remaining limitations

- Hosted Supabase Auth/RLS/Realtime/network load; phone OTP/SMS delivery/registration and production invitation acceptance.
- Real Meta templates/delivery/webhooks, reconciliation procedures and hosted worker scheduling.
- Vercel deployment/domains/TLS/platform cache/secrets/cron. CLI is absent; for a later approved deployment, strongly recommend npm i -g vercel. No installation/deployment here.
- Storage uploads/policies; key rotation/recovery, disk/backup encryption, restore drills, retention/deletion, incident response, MFA/access reviews and Singapore PDPA/legal/clinical safety sign-off.
- Eight high-severity development-tool findings remain.
- Full crash/failover/chaos/penetration testing, historical-note doctor UI, account edit/deactivation, appointment cancel/reschedule/check-in and richer scheduling were not added.

The verified local prototype is **not cleared for real patient use**.

After verification, the fake browser session was signed out and the temporary Next.js verification server was stopped. The working local Docker/Supabase stack and ignored fake fixtures were retained for recreation/retesting.

---

## CLOUD STAGING / PRODUCTION-READINESS — PHASE 2

Evidence date: **2026-10-04, Asia/Singapore**. Earlier local evidence above is retained as history. This phase did not deploy, commit, push, configure final clinic production accounts, use real patient information or send provider messages. Hosted verification is incomplete because authenticated staging projects/provider credentials were unavailable. No hosted success is inferred from implemented code or loopback results.

Labels in this section: **VERIFIED**, **IMPLEMENTED BUT UNVERIFIED**, **BLOCKED — CREDENTIAL REQUIRED**, **OWNER/LEGAL DECISION REQUIRED**, **NOT IMPLEMENTED**. VERIFIED always identifies the exercised environment below.

### 1. Git state before and after

HEAD before/after: **26567e68c4d1e8098e6729e5a2444235c296c0b4**. Before: eight modified tracked files (.gitignore, README.md, next.config.ts, package-lock.json, package.json, globals.css, layout.tsx, page.tsx), and the existing untracked components/docs/scripts/application/Supabase/config directories listed in the earlier report. After: those entries remain, plus visible safe .env.example and src/app/error.tsx; other additions sit under already-untracked directories. Nothing staged, committed or pushed.

Phase-specific SHA-256 comparison confirms **package-lock.json, original two migrations, Supabase config/seed, homepage, root layout and global CSS unchanged** from this phase's starting contents. Existing .env.test.local and local identity/password manifest were not overwritten (both retained their 14:10:07 local write time). Generated dumps, credentials and browser evidence are ignored. The HEAD diff still includes earlier user work: its 8 tracked files / 11,473 additions / 4,357 deletions is not the size of this phase's changes; untracked files are absent from that Git stat. `git diff --check` passes.

### 2. Files changed in this phase

| Purpose | Files |
| --- | --- |
| Safe environment model | .env.example; .gitignore; next.config.ts; src/lib/environment.ts; src/lib/environment.test.ts; src/lib/env.ts; src/lib/server-env.ts |
| Existing clients / server secret separation | src/lib/supabase/client.ts; admin.ts; middleware.ts; src/lib/auth/session.ts; src/lib/data/clinical.ts; src/lib/notifications/outbox.ts; worker.ts; src/app/api/consultations/route.ts |
| Health / events / failures | src/app/api/health/route.ts; route.test.ts; src/app/error.tsx; src/lib/observability/events.ts; src/lib/http/api.ts; client.ts; client.test.ts; src/components/queue-live.tsx; staff-queue-console.tsx; doctor-console.tsx |
| Provider containment / encryption validation | src/lib/notifications/whatsapp.ts; whatsapp.test.ts; src/app/api/notifications/process/route.ts; src/lib/security/encryption.ts; encryption.test.ts |
| Private infrastructure | supabase/migrations/20261004092502_private_clinical_storage.sql (new; original migration history preserved) |
| Verification / bootstrap tooling | package.json (scripts only); scripts/bootstrap-local.mjs; run-local-app.mjs; verify-missing-key.mjs; verify-client-bundle.mjs; bootstrap-staging.mjs; staging-config.mjs; run-staging-check.mjs; verify-local-restore.mjs; src/test/integration.test.ts; hosted-staging.test.ts |
| Documentation | README.md; docs/architecture.md; roadmap.md; implementation-status.md; cloud-staging-runbook.md; development-security-review.md |

These edits map to explicit staging isolation, server secrecy, health/failure visibility, controlled provider testing, private Storage, recovery and verification requirements. No product redesign, clinical decision functionality or dependency resolution change. Expanded scope was stated before editing.

### 3–19. Cloud and security evidence

| Report item | Status and actual evidence |
| --- | --- |
| 3. Development dependency analysis | **VERIFIED** installed versions/chains/advisory and registry. Eight inherited HIGH entries originate in braces 3.0.3; no published patched release. Audit suggests major downgrades, not a low-risk compatible fix. No upgrade/lockfile edit/forced fix/suppression. Full table, phase exposure and isolation requirements: [development-security-review.md](development-security-review.md). |
| 4. Environment architecture | **VERIFIED locally**: explicit matching LOCAL/STAGING/PRODUCTION, loopback-only LOCAL, HTTPS/project-ref cloud validation, no cloud preview, public-key validation/variable allowlist, server-only medical key. Unit cases reject missing/mismatched configuration and privileged public keys. Actual cloud secret scoping: **BLOCKED — CREDENTIAL REQUIRED**. |
| 5. Hosted migration result | **BLOCKED — CREDENTIAL REQUIRED**. Supabase projects list returns AccessTokenRequiredError; no authenticated project/ref, link or hosted migration. Actual hosted version: **none applied**. Local incremental db push applied 20261004092502; local migration list matches all three versions. Earlier clean-reset evidence for two migrations remains historical; no new clean hosted reproduction claimed. |
| 6. Staging account/bootstrap | **IMPLEMENTED BUT UNVERIFIED** guarded five-role synthetic bootstrap, independent random passwords, patient/staff/doctor mappings and partial-failure manifest. Actual hosted identities: **BLOCKED — CREDENTIAL REQUIRED**. Existing local credentials not reused or replaced. Requires two owned test phones and separate project confirmation. |
| 7. SMS OTP | Existing patient OTP architecture **IMPLEMENTED BUT UNVERIFIED** on a real provider. Staging provider configuration/request/correct/invalid/expired/throttling/session/refresh/linkage/log review **BLOCKED — CREDENTIAL REQUIRED**. Local password Auth does not verify SMS. Rate limits were not weakened. |
| 8. WhatsApp | Adapter/worker **IMPLEMENTED BUT UNVERIFIED** against Meta. Real template acceptance/delivery/response transitions **BLOCKED — CREDENTIAL REQUIRED**. **VERIFIED locally with mocked transport**: dedup, concurrent claims, bounded retry, schedule, reconciliation containment; adapter unit tests exercise allowlist/local denial, acknowledged response, timeout/5xx/408 uncertainty and abort signal. No real provider sends. Webhook delivery receipts **NOT IMPLEMENTED**. |
| 9. Private Storage | **VERIFIED locally** reserved private clinical-private bucket, restrictive fences, actual synthetic upload, anon/all-role enumeration/download/signing denial, service-role 60-second signed URL download and cleanup. UUID object names. Cloud provisioning/security **BLOCKED — CREDENTIAL REQUIRED**. Patient/staff/doctor/admin application file authorization and document management **NOT IMPLEMENTED**; all app roles intentionally denied pending design approval. Retention **OWNER/LEGAL DECISION REQUIRED**. |
| 10. Backup/restore | **VERIFIED local database rehearsal only**: separate target clinic_restore_phase2_1791107334853; known encrypted visit/prescription/item restored, 25 patients/27 Auth users/360 audit rows and migration/catalog/publication counts match; relationships and authorized decryption pass. Local dump/restore/check elapsed 2,123ms, not a hosted RTO. ACL/owners excluded, no Storage binaries or restored-app/provider verification. Source never overwritten. Hosted supported recovery drill **BLOCKED — CREDENTIAL REQUIRED**; operational RPO/RTO undefined. |
| 11. Hosted application | **BLOCKED — CREDENTIAL REQUIRED**. Live check found Vercel CLI 61.0.0 installed (correcting the older local report's absent-CLI note), but logged out; no app project/deployment URL. CLI categories lookup requested login and was cancelled. No final domain configured. Existing vercel.ts/cron preserved; deployment-plan/scheduler/TLS/protection/logs not verified. |
| 12. Hosted RLS | **IMPLEMENTED BUT UNVERIFIED** dedicated staging suite includes real SQL/PostgREST/RPC and API role denials, not UI hiding. Execution **BLOCKED — CREDENTIAL REQUIRED**. Local actual authorization remains **VERIFIED** in all 25 integration cases. |
| 13. Hosted patient E2E | **BLOCKED — CREDENTIAL REQUIRED**. No hosted browser or OTP evidence. Prepared password/API workflow is **IMPLEMENTED BUT UNVERIFIED** and does not cover all browser acceptance requirements. |
| 14. Hosted reception E2E | **BLOCKED — CREDENTIAL REQUIRED**. Local API/browser controls and pause/Realtime remain **VERIFIED locally** only. |
| 15. Hosted doctor E2E | **BLOCKED — CREDENTIAL REQUIRED**. Local encrypted clinical workflow, failed offline submission, preserved input and manual completion after reconnect **VERIFIED locally** only. |
| 16. Hosted admin E2E | **BLOCKED — CREDENTIAL REQUIRED**. Local intended settings/invites/audit/route restrictions **VERIFIED locally** only; no real emails sent or hosted administration configured. |
| 17. Hosted concurrency/Realtime | **BLOCKED — CREDENTIAL REQUIRED**. Prepared suite caps concurrent operations at four, tests two joins/four call-nexts, overlap constraint and Realtime. **VERIFIED local** existing 16 joins/12 call-nexts/replay/collision suite and actual browser pause/restore/disconnection; no hosted load performed. |
| 18. Encryption/secrets | **VERIFIED locally** actual raw encrypted values/API ownership/decryption/missing-key failures, malformed envelope validation, local restore decryption and optimized client scan. 46 assets scanned for three supplied service/encryption/cron secret values; no matches. Actual WhatsApp/provider secrets absent, so no actual-value scan of those credentials claimed. Key module server-only; source/migrations do not persist medical key. Hosted encryption/decryption/log/bundle evidence **BLOCKED — CREDENTIAL REQUIRED**. Production rotation/escrow design **OWNER/LEGAL DECISION REQUIRED**; no rotation performed. |
| 19. Monitoring/failure modes | **VERIFIED locally** health Auth/PostgREST probes, protected aggregate detail, generic readiness503 for mocked outage/key absence, safe events, no clinical/OTP/provider-body logging added, browser stale warning, auth401, pause updates, queue request failure, offline no-commit/input preservation/reconnect completion. Mocked worker timeout/rejection/dedup/reconciliation pass. Hosted telemetry aggregation, availability, failure drill and scheduled invocations **BLOCKED — CREDENTIAL REQUIRED**. Provisioned external alerting/dashboards **NOT IMPLEMENTED**. Full platform/provider log scrubbing/retention and support ownership remain operator decisions. |

### 20. Final command evidence — LOCAL separately from HOSTED

| Command/check | Result / scope |
| --- | --- |
| npm test | **VERIFIED LOCAL**: 46 unit tests pass; 25 local integration + 4 hosted cases skipped deliberately when their respective environments are absent. Skips are not passes. |
| npm run typecheck | **VERIFIED** exit 0 |
| npm run lint | **VERIFIED** exit 0 |
| npm run build | **VERIFIED LOCAL configured optimized build** exit 0; explicit LOCAL values loaded privately from existing test env. Not a hosted Vercel build. |
| npm audit --omit=dev | **VERIFIED** exit 0, zero findings |
| Full npm audit | Eight HIGH inherited development findings remain; root unpatched, risk documented without suppression |
| npm run test:integration | **VERIFIED LOCAL optimized app**: 25/25 pass; real DB/RLS/worker fixture tests, provider transport mocked |
| verify-missing-key.mjs | **VERIFIED LOCAL optimized app**: unauthorized401; authorized clinical read/write and worker500; no clinical commit or job claim |
| verify-client-bundle.mjs | **VERIFIED LOCAL**: 46 assets / three supplied server-secret values absent |
| npm run test:staging | **BLOCKED — CREDENTIAL REQUIRED**: explicitly stops because ignored .env.staging.local is absent; no hosted case executed |
| Migration list | **VERIFIED LOCAL**: 20260929074652, 20261004050104, 20261004092502 present locally; actual hosted list unavailable |

Initial dev regression had one default 5-second cold /admin compile timeout and one missing-key error-message mismatch; the message was restored and subsequent warmed/full optimized runs passed. A final-check wrapper accidentally loaded the integration-enable variable after stopping the server; that attempt failed with connection refusals. Corrected isolated unit/build commands and integration against the running optimized app are the reported successful results. No assertions or rate-limit rules were weakened to get a pass.

### 21. Browser evidence

**VERIFIED LOCAL optimized build**: 21 authenticated role/page/width checks, at 390px, 768px and 1440px: patient queue/appointments/records/prescriptions, receptionist /staff, doctor /doctor, admin /admin. No body/document overflow, page/console errors, HTTP failures or unexpected network failures. 79 ERR_ABORTED requests occurred during deliberate navigation/prefetch/refresh cancellation and are retained in evidence, not silently reported as zero failed requests. Protected admin routes redirect anonymous to login and patient to unauthorized. WebSocket endpoints observed only **127.0.0.1:54321**; this proves these were local checks.

Separate local browser fault checks prove pause/resume reaches waiting patient through actual Realtime; removed cookies lead to401/session-expired notice; interrupted Realtime shows stale status; aborted queue refresh shows a clear failure; offline doctor submission leaves clinical text intact, commits nothing and does not replay automatically. After reconnect/checking current consultation state, manual completion commits once and patient authorized history includes the synthetic note.

Hosted principal pages at all three widths, hosted browser roles/console/network/redirects and hosted Realtime are **BLOCKED — CREDENTIAL REQUIRED**. Not a complete accessibility/device/browser certification. Protected synthetic evidence resides under ignored .local-verification/phase2 (audit/changes/browser/restore); do not publish dumps or credentials.

### 22. Outstanding decisions

**OWNER/LEGAL DECISION REQUIRED**: approved purposes/consent/notices; patient identity/guardian verification; correction/access/deletion processes; staff access/onboarding/offboarding/revocation/reviews; clinical/private-file/notification/audit/backup retention and legal holds; breach/incident escalation/reporting; provider contracts/regions/cross-border processing; secure key escrow/rotation/recovery; measured and agreed RPO/RTO; support ownership, downtime/manual clinic procedures, staff training, independent security/penetration/clinical safety review and final rollout signoff. No legal compliance claim or clinic policy was invented. The gap register and actionable health/provider/queue/encryption runbooks are in [cloud-staging-runbook.md](cloud-staging-runbook.md).

### 23. GO / NO-GO

| Use | Recommendation | Boundary |
| --- | --- | --- |
| Owner demonstration | **GO — supervised LOCAL demonstration with fake data** | Explain SMS/Meta/cloud/restore/operations gaps. No real patient data; no claim of hosted readiness. Cloud owner demo remains NO-GO until staged deployment acceptance. |
| Limited staff pilot with fake data | **NO-GO for a hosted operational pilot** | Dedicated hosted deployment, role/browser/provider/failure acceptance, access and monitoring ownership are still missing. Existing supervised local role demos remain possible. |
| Real patient pilot | **NO-GO** | Hosted/provider/recovery/security and owner/legal/clinical decisions unresolved. |
| Production use | **NO-GO** | Prototype only; no final production accounts/domain configured or approved. |

Next credential-dependent sequence: identify/authenticate dedicated Supabase and Vercel staging projects; supply protected staging configuration and controlled phone ownership; apply/reconcile migration history; bootstrap; deploy/exercise HTTPS staging; run hosted SQL/API/browser/Realtime/OTP/Meta/Storage/failure acceptance; restore into a separate safe project; obtain operator/legal/clinical decisions. Do not commit/push or configure the clinic's eventual production accounts as an implicit continuation.

Cleanup: temporary Next.js verification server stopped; test browser contexts closed. Existing Docker/Supabase stack, original ignored developer secret files, synthetic evidence and safe separately named restore databases retained. No destructive restore/drop against the source.
