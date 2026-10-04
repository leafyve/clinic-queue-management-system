# Implementation roadmap

## Phase 1 — Foundation

- Next.js 15, TypeScript, Tailwind, accessible component primitives.
- Supabase SSR clients, OTP/password authentication, protected route layout, database roles, and RLS.
- Environment validation and production-safe error handling.

## Phase 2 — Patient journey

- Clinic homepage, mobile OTP login, appointment booking, remote queue join, live queue position, records, and prescriptions.
- Slot validation, duplicate active-queue prevention, data consent capture, and printable prescription view.

## Phase 3 — Clinic operations

- Reception queue board with call, recall, skip, complete, emergency, walk-in, and pause controls.
- Doctor workspace with history, encrypted notes and diagnosis, prescription authoring, and consultation completion.
- Atomic queue commands, durable audit records, and realtime updates.

## Phase 4 — Administration and communications

- Staff and clinic settings, analytics, audit log, WhatsApp outbox, queue alerts, and appointment-reminder worker.
- Rate limits and failure/retry visibility.

## Phase 5 — Acceptance and release

- Unit, integration, RLS, accessibility, responsive, and production build checks.
- Apply migration to a dedicated Supabase project, configure Auth/Realtime/Storage, connect approved WhatsApp templates, load secrets, and deploy on Vercel.
- Complete clinical, security, PDPA, backup/restore, incident-response, and penetration-test sign-offs before live patient use.

## Cloud staging verification checkpoint — 2026-10-04

The requested cloud verification phase is separate from the feature milestones above. Local security/environment hardening and a guarded staging acceptance path are prepared. Hosted migrations, identities, SMS, Meta, restore/deployment and hosted browser/RLS/Realtime evidence remain blocked by missing authenticated staging resources. See [implementation-status.md](implementation-status.md) for evidence and GO/NO-GO decisions, and [cloud-staging-runbook.md](cloud-staging-runbook.md) for the remaining sequence. Do not add features or configure final clinic production accounts to bypass these gates.
