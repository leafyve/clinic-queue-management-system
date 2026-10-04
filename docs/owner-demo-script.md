# Jo-Lin owner demonstration — supervised LOCAL, synthetic data

Purpose: a repeatable 5–8 minute conversation about queue control and information in one place. Exercise the existing real application with local password Auth, RLS, Realtime and encrypted fake clinical text. Do not use the disconnected visual preview.

Readiness remains unchanged: supervised LOCAL owner demo **GO**; hosted staff pilot, real-patient pilot and production **NO-GO**. Cloud staging remains **BLOCKED — CREDENTIAL REQUIRED**. This document is not a rollout approval.

## A. Before the meeting

From the repository root, with Docker Desktop running:

```powershell
npx supabase start
npm run demo:reset
npm run dev:local-test
```

`demo:reset` erases and recreates the disposable LOCAL database using existing migrations and seed. It refuses unexpected/inherited hosted URLs, non-LOCAL environments, additional clinics and nonfixture patient/account records before mutation. It reads credentials only from the exact loopback CLI status, never hosted dotenv files. Do not use `--linked`, a hosted URL, real patient data, or production configuration. If refused, inspect the cause; do not remove the guard. Stop app/browser activity during reset. All sessions need to sign in again afterward.

The bootstrap creates random local passwords/keys saved only in ignored `.local-verification/identities.json` and `.env.test.local`. Retrieve the password privately from that local file before the meeting. **Never paste it into this document, a slide, a recording or source control.** Reset retains the local encryption key/password file while recreating the corresponding accounts.

For a rehearsed optimized app, use the same reset and then:

```powershell
node --env-file=.env.test.local node_modules/next/dist/bin/next build --turbopack
npm run start:local-test
```

Stop dev before starting the optimized app. Both launchers bind only `127.0.0.1:3100` and blank WhatsApp credentials. No provider worker is needed. Keep the patient queue tab visible so Realtime updates can be seen.

| Browser profile | Account / actual role | Open |
| --- | --- | --- |
| Patient | `local-patient@example.invalid` / patient | `http://127.0.0.1:3100/login?next=/queue`, then `/` and `/queue` |
| Reception | `local-receptionist@example.invalid` / receptionist | `http://127.0.0.1:3100/login?next=/staff` |
| Doctor | `local-doctor@example.invalid` / doctor | `http://127.0.0.1:3100/login?next=/doctor` |
| Owner/admin | `local-admin@example.invalid` / admin | `http://127.0.0.1:3100/login?next=/admin` |

Use **separate browser profiles or isolated contexts**, not four tabs sharing one cookie jar. Each account uses the existing **Clinic staff** password tab, including the fake patient; this is local password Auth, not an SMS demonstration. Pre-sign in before presenting. Patient role stays patient regardless of the login tab label. No query string or cookie grants a role or demo access.

Recommended presentation: patient viewport **390 × 844**, reception/doctor/admin **1440 × 1000**. Keep patient and reception side by side when calling a number; use a second monitor or switch windows deliberately. Test **768px** before the meeting. Set browser zoom to 100%. Do not show credentials, developer consoles, database tables or implementation detail to the owner.

### Exact starting scene

All names have the visible prefix `DEMO —`; they are invented and unrelated to clinic patients.

- **A001 Alice Wong**, **A002 Ben Goh**, **A003 Grace Teo**: synthetic completed background visits, with 6-minute waits and consultation durations 10, 12 and 14 minutes.
- **A004 Sarah Lim**, **A005 Michael Lee**: waiting, normal priority, no patient currently being served, queue open and unpaused; doctor available.
- **Daniel Tan**: signed-in patient, born 18 April 1984, no active ticket. One synthetic visit seven days before reset, encrypted fake penicillin-allergy history, and a clearly fake historical prescription. Joining gives **A006**, two ahead, approximately **24 minutes** before a consultation starts.
- Patient medications use the existing seeded catalog. Enter `Paracetamol 500 mg` during Daniel’s consultation; no new drug catalog or clinical logic is introduced.
- WhatsApp is disabled. Internal staff headers say **DEMO MODE · LOCAL · synthetic data only**, with SMS/WhatsApp production integration pending and cloud hosting staging pending.
- Analytics comes from these records and the live rehearsal actions. During an ordinary daytime reset, baseline is 5 patients today, 6-minute average wait, 12-minute average consultation. Immediately after Singapore midnight, earlier fixture timestamps correctly belong to yesterday and today's cards may differ. The recorded scenario is in ignored `.local-verification/demo-scenario.json`; there is no fixed KPI override.

Rehearse once, then run `npm run demo:reset` again and re-sign in to leave the original starting scene. Do not run the destructive integration suite after this final reset: it changes queue/clinical fixtures.

## B. 5–8 minute sequence

| Time | Action | What the owner sees |
| --- | --- | --- |
| 0–1 | Show the patient homepage. State that this is a local demonstration with invented people. | Join Queue, Book Appointment and Check Queue Status are clear. |
| 1–2 | As Daniel, open `/queue`, confirm consent, choose Join today’s queue. | A006, two patients ahead, current serving empty, approximate 24-minute wait. Reception receives Daniel without reloading. |
| 2–4 | Reception: Call next patient → Sarah A004; Complete Sarah; Call next → Michael A005. Keep Daniel’s queue visible. Briefly Pause queue with `DEMO — doctor break`, then Resume queue. Complete Michael; Call next → Daniel A006. | Serving number and position change live; Daniel moves to one ahead, then sees “It’s your turn.” Pause makes estimates unavailable; resume restores them. |
| 4–6 | Doctor: Daniel appears. Expand the previous visit, show DOB/age, allergy and previous notes. Start consultation, enter the fake fields below, Complete visit. | Current patient, history, notes, diagnosis and prescription in one workspace. |
| 6–7 | Patient sees queue visit ended. Choose View visit history, then `/prescriptions`. | The newly saved fake visit and prescription alongside the previous fake visit. Explain that an ended queue ticket alone does not prove a consultation was recorded. |
| 7–8 | Admin: Overview then Audit log. Point out patients today, wait/consultation durations, arrivals by hour and actual queue/consultation actions. | A brief view of operational visibility. Close with questions about the clinic’s current practice. |

Reception completion of Sarah/Michael is a queue-control shortcut in the presentation. It does **not** create clinical notes or prescriptions for them. Daniel follows the actual doctor consultation path. Do not use Emergency priority on Daniel during the main story; explain its presence without changing queue order. Walk-in, recall and skip are visible controls, not extra demonstrations to fit into eight minutes.

### Fake consultation fields to type

These are presentation text only, not treatment guidance:

| Field | Text |
| --- | --- |
| Reason / chief complaint | `DEMO ONLY — fictional mild fever` |
| Clinical notes | `DEMO ONLY — synthetic consultation. Previous history and allergy reviewed. No real patient or clinical advice.` |
| Diagnosis | `DEMO ONLY — fictional viral illness` |
| Medication | `Paracetamol 500 mg` |
| Dosage | `DEMO — 1 tablet` |
| Frequency | `DEMO — as recorded` |
| Duration | `DEMO — 3 days` |
| Instructions | `Synthetic prescription for presentation only; not treatment advice.` |

Daniel’s clinical form begins blank. After completing him, start a different fake patient only during rehearsal and confirm none of Daniel’s text follows them. Reset afterward.

If the eight-minute version is too long, omit pause/resume and describe the visible control. Show the queue journey, Daniel’s consultation and saved visit first.

## C. What to say

“Patients don’t have to sit downstairs for an hour wondering when their turn will come. They can see their number and follow their place before travelling here.”

“The receptionist still has full control of the queue. Patients receive a place, and your team decides when to call them.”

“If the doctor needs a break, the queue can pause. Patients see that waiting estimates are temporarily unavailable, and estimates return when reception resumes the queue.”

“This number is an estimate based on position and recorded consultation durations. An urgent case can change the order.”

“The doctor has the information in one place: the patient, allergy, previous visit, today’s notes and the prescription.”

“This visit is now saved for the patient. These names and records are all invented for today’s demonstration.”

“The owner can see how the queue is moving and review who performed key actions. These figures describe this small demonstration, not the clinic’s actual performance.”

“SMS and WhatsApp still need production integration and verification. Today's live updates are on this open page. Cloud staging is also pending; this is not ready for real patients.”

## D. What not to claim

- SMS OTP is **not production verified**. We used real local password authentication for the demo.
- WhatsApp is **not production verified**. No real message delivery is demonstrated.
- Cloud staging is **not complete**; it remains **BLOCKED — CREDENTIAL REQUIRED**.
- This prototype is **not approved for real patient use**, a hosted staff pilot or production.
- Make **no PDPA/legal compliance claim**.
- Make **no production uptime/security claim** or guarantee of accurate waiting times.
- Do not present synthetic KPIs as clinic results or measured business improvement.
- Do not claim clinical decision support, automatic diagnosis, complete appointment/walk-in integration, or a replacement for the clinic’s official medical record.
- Book Appointment is an existing secondary path; do not imply the main queue story demonstrates every scheduling feature or an owner-approved clinic policy.

## E. Owner questions after the demo

Ask and record answers; do not assume policies:

1. How do you currently issue queue numbers?
2. Approximately how many patients do you see on a normal weekday?
3. What is the busiest period?
4. How long is a typical consultation?
5. Do patients currently call to ask how long the queue is?
6. Would you allow patients to join the queue before arriving?
7. How late may they arrive after being called?
8. What happens when somebody misses their turn?
9. How do you handle urgent patients?
10. How do you handle doctor breaks?
11. Would appointments and walk-ins eventually share one queue?
12. Which staff members would need dashboard access?
13. Do you currently use WhatsApp with patients?
14. Would you prefer WhatsApp, SMS or both?
15. What existing clinic software must remain the official medical record?

## Rehearsal checks and recovery

If live updates fail, stop calling patients, show the stale-status notice and check the local stack. Refresh deliberately; do not narrate a manual refresh as live delivery. Never rerun reset while anyone is entering clinical text.

If you lose your place in the story, stop the app, reset, start again, re-sign in and rehearse from A006. No alternate fake application, provider messaging, hosted setup, deployment, commit or push is needed.

For regression verification, stop the demo app, recreate ordinary test fixtures with `npx supabase db reset --local` and `npm run bootstrap:local`, start the local app and run `npm run test:integration`. Those tests deliberately require `LOCAL TEST` fixtures and mutate them; do not weaken their guard to accept presentation data. Run `npm run demo:reset` afterward to return to the meeting scene.
