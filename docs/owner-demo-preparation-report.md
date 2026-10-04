# Phase 3 — owner demonstration preparation

Evidence: 4 October 2026, Asia/Singapore. Supervised LOCAL, invented data only. No deployment, hosted setup, real SMS/WhatsApp, real patient data, commit or push. The existing implementation-status report and GO/NO-GO assessment were preserved.

## 1. Git status before / after

HEAD remains `26567e68c4d1e8098e6729e5a2444235c296c0b4`. Before and after have the same 30 aggregate status entries: eight modified tracked files and 22 untracked files/directories. Nothing was staged. New Phase 3 files are inside already-untracked directories, so the short status has the same directory entries.

```text
 M .gitignore
 M README.md
 M next.config.ts
 M package-lock.json
 M package.json
 M src/app/globals.css
 M src/app/layout.tsx
 M src/app/page.tsx
?? .env.example
?? components.json
?? docs/
?? scripts/
?? src/app/admin/
?? src/app/api/
?? src/app/appointments/
?? src/app/doctor/
?? src/app/error.tsx
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
```

Baseline file hashes and targeted pre-edit copies are in ignored `.local-verification/phase3-before`. Hash comparison found changes only in the listed Phase 3 files; architecture, implementation status, bootstrap/launcher, API/data/security modules, and migrations remain unchanged. The large HEAD diff contains previous work and is not a Phase 3 diff. Dependencies and the lockfile were not edited by this task.

## 2. Files changed

Eleven existing files edited and five new files:

| Purpose | Files |
| --- | --- |
| Local reset | `package.json` (one script entry); new `scripts/demo-reset.mjs`; new `scripts/local-demo-safety.mjs` |
| Patient presentation | `src/app/page.tsx`; `src/components/queue-ticket.tsx`; `src/components/queue-live.tsx` |
| Typography | `src/app/globals.css` (one CSS declaration change) |
| Staff presentation | `src/components/staff-queue-console.tsx`; `src/components/doctor-console.tsx`; `src/components/admin-console.tsx` |
| Server-derived indicator | `src/components/workspace-header.tsx`; `src/lib/environment.ts` |
| Safety checks | `src/lib/environment.test.ts`; new `src/test/demo-reset.test.ts` |
| Presenter / evidence documentation | new `docs/owner-demo-script.md`; new `docs/owner-demo-preparation-report.md` |

All changed source hunks map to the authorized contract: repeatable synthetic reset, genuine readability/status defects, existing authorized history display, internal LOCAL indicator/provider labels and verification. Browser/check scripts and screenshots are ignored local evidence, not additional product paths.

## 3. Demo reset implementation

`npm run demo:reset` validates the exact repository loopback API/database endpoints and rejects inherited non-LOCAL/hosted configuration **before mutation**. It accepts no caller-supplied target arguments. It reads all existing patients/accounts/clinics in paginated queries, refusing unrecognized names, non-`.invalid` accounts or additional clinics rather than deleting them.

It executes explicit `supabase db reset --local`, reuses the unchanged local bootstrap, then creates the named fixtures, encrypted history and prescription. The existing catalog is supplied by the existing seed. Queue counters and local sessions are recreated; clinic pause is cleared, queue open, doctor available, WhatsApp disabled. Privileged credentials come only from CLI status for the exact local stack and are not embedded in source/docs. Random passwords/keys remain in ignored local files.

This command intentionally clears the whole disposable synthetic LOCAL database, including prior local integration fixtures. Stop concurrent app activity first. Do not treat it as a nondestructive data importer. Failed setup exits visibly; no success message is emitted for partial setup.

After discovering stale keep-alive sockets following container restart, the command now closes pre-reset connections and recreates its API client from fresh local status. Multiple successful executions, including the final reset after optimized browser rehearsal, were observed. Two explicit initial-state checks match: A001–A003 completed, A004/A005 waiting, no active Daniel ticket, unpaused/open queue, notifications disabled, four encrypted consultations with durations 10/12/12/14 and one historical prescription. Actual inherited PRODUCTION and hosted-URL command invocations were refused before mutation; unknown-data guards have unit coverage.

## 4. Exact fake scenario

- A001 **DEMO — Alice Wong**, A002 **DEMO — Ben Goh**, A003 **DEMO — Grace Teo**: completed synthetic background visits; waits 6 minutes; consultation durations 10, 12 and 14 minutes.
- A004 **DEMO — Sarah Lim**, A005 **DEMO — Michael Lee**: waiting, normal priority.
- **DEMO — Daniel Tan**, DOB 18 April 1984: signed-in remote patient with one fictional health review seven days earlier, encrypted fake penicillin-allergy history and a historical fake prescription. Real local admission gives **A006**, two ahead and about 24 minutes initially.
- Reception calls and completes Sarah/Michael as queue-only actions, then calls Daniel. Doctor reviews Daniel's authorized fake history, starts and completes his actual consultation, saving the typed synthetic notes, diagnosis and prescription. Patient sees the new visit and prescription. Admin shows real records from the fixtures and actions.
- **DEMO — Noah Ong** is an additional rehearsal-only walk-in used after completion to prove clinical-form/history isolation. The final reset removes him.

Visible names and number allocation are deterministic; internal Auth/row UUIDs and ciphertext IVs are correctly fresh. Timestamps are relative to the actual Singapore date/time and never in the future. Analytics may differ immediately after midnight and after rehearsal actions; no KPI values are overridden.

## 5. Patient presentation

Shorter mobile headline and spacing bring actions forward. Join Queue, Book Appointment and Check Queue Status are explicit. The illustrative homepage ticket says **Example**. Unsupported WhatsApp promises were replaced with open-page live-update copy.

An active ticket appears first on mobile. Your number, currently serving, patients ahead and estimated wait have clear hierarchy and stronger contrast. Status text distinguishes approaching, called, consulting and skipped. On disappearance of the active ticket, it says the queue visit ended and links to actual authorized history/prescriptions; it does not equate every disappearance with completed treatment.

Body text now uses the existing Atkinson Hyperlegible font. The one-line fix applies it where its variable exists; Newsreader headings are retained. No new motion or redesign.

## 6. Reception presentation

The serving panel shows current name plus number. Waiting count and upcoming order are clearer. Existing controls remain, with 44px buttons and enough row space to read full names. Skip uses a caution color; Emergency priority uses restrained amber, with unchanged queue semantics. Existing call/recall/skip/complete, walk-in and pause/resume handlers remain unchanged.

## 7. Doctor presentation

Current number/name, actual DOB, allergy and previous visits are visible. The sidebar can expand the two most recent visits already loaded by the existing authorized/audited history function to read notes and diagnosis. The chief complaint label reads Reason for visit / chief complaint. Today's notes, diagnosis and prescription remain the existing form and encrypted persistence path. No clinical decision support, automatic diagnosis or new clinical endpoint.

The optimized rehearsal completed Daniel, then registered Noah. All eight clinical fields were empty for Noah, and neither Daniel's penicillin text nor previous notes were present.

## 8. Admin presentation

Existing cards and arrivals chart remain derived from stored data. A brief explanation distinguishes synthetic local fixtures/demo actions from clinic results. Existing audit tab showed `consultation.complete` and queue actions. The settings description labels WhatsApp production integration pending. No invented percentage, KPI override or new analytics logic.

## 9. Demo-mode safety

`WorkspaceHeader` is server-only. Its indicator is derived solely from matching LOCAL server/public environment state, a configured validated loopback origin and non-preview mode. Invalid/mismatched/cloud/privileged-public-key cases return false. No query parameter, cookie or editable user metadata is consulted, and the predicate is not used in authorization.

Staff headers explicitly identify LOCAL synthetic demo, SMS OTP/WhatsApp production integration pending and cloud hosting staging pending. Ordinary patient screens retain simple queue copy.

Browser negative checks: anonymous `demo_mode=true` cookie plus `?demo=true` still redirects `/admin` to login (307); patient admin access still redirects to unauthorized (307); patient queue-control POST remains 403. Original integration/security acceptance passed unchanged. RBAC, RLS, grants, encryption algorithm and database architecture were not relaxed or rewritten.

## 10. Owner-demo script

See [owner-demo-script.md](owner-demo-script.md). It includes startup/reset commands, optimized-app alternative, isolated browser/role layout, account emails without passwords, exact 0–8 minute sequence, fake consultation text, business-language narration, prohibited claims, all 15 requested owner questions, rehearsal checks and recovery.

## 11. Tests / build and diagnosed defects

| Command / check | Observed result |
| --- | --- |
| `npm test` | Exit 0; 49 passed, 29 intentionally skipped; 10 files passed, 2 skipped |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; no warnings/errors |
| `npm run build` | Exit 0; optimized Next.js build, 23 routes; local environment supplied without printing values |
| `npm audit --omit=dev` | Exit 0; zero production vulnerabilities |
| `npm run test:integration` | Exit 0; all 25 original real local integration/security tests against an optimized app after ordinary local reset/bootstrap |
| `git diff --check` | Exit 0 |
| Named demo reset | Repeated successful executions; matching starting-state checks |
| Optimized owner journey | All six live-transition checks, persistence, new-patient isolation and negative auth checks passed |

The final font-only CSS adjustment was rebuilt and browser-tested after integration acceptance; no backend/security code changed afterward. Unit/type/lint checks were rerun. This is local evidence, not hosted/provider verification.

**Diagnosis:** the direct patient `queue_entries` subscription in `QueueLive` was rejected after homepage navigation with `invalid column for filter clinic_id`, blocking later updates despite working admission and reception. The column is readable to authenticated but not anonymous subscribers; the exact token timing was not profiled. A fresh trace confirmed the existing public operational subscription was accepted.

**Fix:** patient `QueueLive` now uses only the existing `clinic_settings` signal, emitted by the existing trigger on every queue change, then fetches its authorized redacted snapshot. Rejected system subscriptions show interruption rather than being ignored. No grant/policy/schema change. The full browser journey subsequently passed in dev and the optimized app, including pause/resume and completion.

**Other observed failures:** the first reset hit a stale socket after API container restart, fixed by fresh connections. A browser attempt overlapped reset and failed login; subsequent checks waited for reset completion and reauthenticated. Initial typecheck caught a JavaScript guard parameter typing issue, corrected with JSDoc. Lint initially included a temporary CommonJS browser script; its local script declaration was corrected. These failures were not counted as successful evidence or hidden by weakening checks.

**Typography diagnosis/fix:** browser computed body font was Times New Roman; the Atkinson variable existed on body but not html. Applying the intended font on body corrected the computed family, confirmed on every final layout check.

## 12. Browser sizes checked

Final optimized app: **21 role/page/viewport checks** with no body/document horizontal overflow and correct intended body font.

- **390px patient:** homepage, active queue, pause state, ended visit, records, prescriptions, appointments.
- **768px:** patient homepage/queue/records/prescriptions/appointments; receptionist waiting console; doctor history/current-patient view; admin overview and audit.
- **1440px:** receptionist, doctor history/consultation, admin overview/audit.

Zero page/console errors, zero HTTP failures and zero unexpected network failures in the final normal journey. **58 `net::ERR_ABORTED` navigation/prefetch/refresh cancellations** were retained separately. Expected authorization denials were checked separately. Actual Realtime proved remote join → reception, serving-number change, approaching state, pause/resume, Daniel call → doctor and completed-visit transition.

Screenshots, sanitized event summaries and layout data are in ignored `.local-verification/phase3-browser`. Reset assertions are in `.local-verification/phase3-reset-checks.json`. Do not publish local credential files.

## 13. Remaining imperfections / final state

- All existing hosted/provider/operational limitations remain. Readiness is **GO only for supervised LOCAL fake-data demo**, **NO-GO** for hosted staff pilot, real-patient pilot and production. Cloud staging **BLOCKED — CREDENTIAL REQUIRED**. No PDPA/legal or production uptime/security claim.
- Use the existing Clinic staff password tab for the fake patient; the label is not an SMS login demo. Separate browser contexts and reauthentication after reset are required.
- Reception completion of Sarah/Michael creates no clinical record. Clinical persistence is shown through Daniel's actual doctor workflow.
- The queue-ended message is page-session presentation state. After reload, use `/records` or `/prescriptions` to see persisted visit information. It deliberately does not infer completed treatment from ticket removal alone.
- Analytics reflects actual fixture dates and rehearsal timing. The rushed demonstration consultation can reduce average duration; this is honest fixture arithmetic, not an improvement claim. Near midnight, some baseline rows belong to yesterday.
- Tablet workspaces stack and require vertical scrolling. Checks cover local desktop Chrome with emulated widths, not a complete device/accessibility/browser certification.
- The original full-development audit findings were not addressed; the requested production-only audit passes. No dependency upgrade or advisory suppression.
- The final reset leaves A004 Sarah/A005 Michael waiting, no current patient, Daniel ready for A006, open/unpaused queue and encrypted fake history. A fresh local optimized app can serve this scene on `http://127.0.0.1:3100` without further implementation.
