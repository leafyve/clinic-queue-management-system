import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { validateDeploymentEnvironment } from "@/lib/environment";
import { open } from "@/lib/security/encryption";

type Identity = { id: string; email: string; password: string; role: string; clinicId: string; patientId?: string; doctorId?: string };
const suite = describe.skipIf(process.env.RUN_HOSTED_STAGING !== "true");
const clients: Record<string, SupabaseClient> = {}, cookies: Record<string, string> = {};
let identities: Record<string, Identity>, admin: SupabaseClient, app: string, clinic: string;
async function api(role: string | null, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return fetch(`${app}${path}`, { method, redirect: "manual", signal: AbortSignal.timeout(15000), headers: { Origin: app, "Content-Type": "application/json", ...(role ? { Cookie: cookies[role] } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
suite("HOSTED STAGING — synthetic authorization and workflow", () => {
  beforeAll(async () => {
    validateDeploymentEnvironment(process.env);
    if (process.env.APP_ENV !== "STAGING" || process.env.STAGING_VERIFICATION_CONFIRM !== process.env.STAGING_SUPABASE_PROJECT_REF) throw new Error("Explicit dedicated staging confirmation required");
    const manifest = JSON.parse(readFileSync(".staging-verification/identities.json", "utf8"));
    app = new URL(process.env.STAGING_APP_URL!).origin;
    if (!app.startsWith("https://") || !manifest.complete || manifest.projectRef !== process.env.STAGING_SUPABASE_PROJECT_REF || manifest.appUrl !== app) throw new Error("Staging target mismatch");
    identities = manifest.identities; clinic = identities.patient.clinicId;
    admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const health = await fetch(`${app}/api/health`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(10000) });
    expect(health.status).toBe(200); expect(await health.json()).toMatchObject({ environment: "STAGING", checks: { project_ref: process.env.STAGING_SUPABASE_PROJECT_REF, database: "available", auth: "available" } });
    // Conservative suite creates new visits and preserves them for inspection.
    // Refuse mixed/nonfixture data and enabled outbound notification processing.
    const patients = await admin.from("patients").select("full_name").eq("clinic_id", clinic);
    expect(patients.error).toBeNull();
    if (patients.data?.some(row => !row.full_name.startsWith("STAGING TEST"))) throw new Error("Nonfixture data present; refusing hosted workflow test");
    const settings = await admin.from("clinic_settings").select("whatsapp_enabled,queue_paused,queue_open").eq("clinic_id", clinic).single();
    expect(settings.error).toBeNull(); expect(settings.data).toMatchObject({ whatsapp_enabled: false, queue_paused: false, queue_open: true });
    const active = await admin.from("queue_entries").select("id").eq("clinic_id", clinic).in("status", ["called", "in_consultation", "waiting", "skipped"]);
    expect(active.error).toBeNull(); expect(active.data).toEqual([]);
    for (const [role, identity] of Object.entries(identities)) {
      if (!identity.email.endsWith("@example.invalid")) throw new Error("Synthetic identities required");
      const jar = new Map<string, string>();
      clients[role] = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: items => items.forEach(({ name, value }) => jar.set(name, value)) } });
      expect((await clients[role].auth.signInWithPassword({ email: identity.email, password: identity.password })).error).toBeNull();
      cookies[role] = [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    }
  }, 90000);

  it("maps every hosted identity and enforces critical allowed/denied SQL and server cases", async () => {
    for (const [role, identity] of Object.entries(identities)) {
      expect((await clients[role].from("users").select("role,is_active").eq("id", identity.id).single()).data).toMatchObject({ role: identity.role, is_active: true });
    }
    expect((await clients.patient.from("patients").select("id").eq("id", identities.patient.patientId!).single()).status).toBe(200);
    expect((await clients.patient.from("patients").select("id").eq("id", identities.other_patient.patientId!).single()).status).toBe(406);
    for (const table of ["staff", "doctors", "audit_logs"]) expect((await clients.patient.from(table).select("id")).data).toEqual([]);
    for (const [table, patch] of [["users", { role: "admin" }], ["patients", { allergies_encrypted: "attack" }], ["queue_entries", { priority: "emergency" }], ["consultations", { notes_encrypted: "attack" }]] as const) expect((await clients.patient.from(table).update(patch).eq(table === "users" ? "id" : table === "patients" ? "user_id" : "patient_id", table === "users" || table === "patients" ? identities.patient.id : identities.patient.patientId!)).error?.code).toBe("42501");
    expect((await clients.patient.rpc("call_next_patient", { target_clinic: clinic })).error?.code).toBe("42501");
    expect((await clients.receptionist.from("consultations").select("id")).data).toEqual([]);
    expect((await clients.receptionist.from("consultations").update({ notes_encrypted: "attack" }).eq("patient_id", identities.patient.patientId!)).error?.code).toBe("42501");
    expect((await clients.admin.from("audit_logs").delete().eq("clinic_id", clinic)).error?.code).toBe("42501");
    expect((await api("patient", "/api/queue/actions", { action: "call_next" })).status).toBe(403);
    for (const role of ["receptionist", "doctor"]) expect((await api(role, "/api/admin/settings", { whatsappEnabled: false }, "PATCH")).status).toBe(403);
    expect((await api("receptionist", "/api/consultations?patientId=" + identities.patient.patientId)).status).toBe(403);
    expect((await api("doctor", "/api/consultations?patientId=" + identities.patient.patientId)).status).toBe(200);
    expect((await api("doctor", "/api/consultations?patientId=" + identities.other_patient.patientId)).status).toBe(200);
    expect((await api("patient", "/api/consultations?patientId=" + identities.other_patient.patientId)).status).toBe(403);
    expect((await api("admin", "/api/admin/settings", { whatsappEnabled: false }, "PATCH")).status).toBe(200);
    expect((await api(null, "/admin")).status).toBe(307);
  }, 60000);

  it("two concurrent hosted admissions, four call-next requests, Realtime, clinical completion and patient history", async () => {
    let eventReceived = false;
    const channel = clients.patient.channel("staging-acceptance").on("postgres_changes", { event: "UPDATE", schema: "public", table: "clinic_settings", filter: `clinic_id=eq.${clinic}` }, () => { eventReceived = true; });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Realtime subscription timeout")), 10000);
        channel.subscribe(status => { if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); } else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) { clearTimeout(timer); reject(new Error("Realtime unavailable")); } });
      });
      const joins = await Promise.all(["patient", "other_patient"].map(role => api(role, "/api/queue", { consent: true })));
      expect(joins.map(r => r.status)).toEqual([201, 201]);
      const snapshots = await Promise.all(joins.map(r => r.json()));
      expect(new Set(snapshots.map(s => s.ownEntry.queueNumber)).size).toBe(2);
      const calls = await Promise.all(Array.from({ length: 4 }, () => clients.receptionist.rpc("call_next_patient", { target_clinic: clinic })));
      calls.forEach(result => expect(result.error).toBeNull());
      expect(new Set(calls.map(result => result.data.id)).size).toBe(1);
      const called = calls[0].data;
      expect((await api("doctor", "/api/queue/actions", { action: "start", entryId: called.id })).status).toBe(200);
      const result = await api("doctor", "/api/consultations", { queueEntryId: called.id, patientId: called.patient_id, doctorId: identities.doctor.doctorId, chiefComplaint: "STAGING TEST complaint", notes: "STAGING TEST encrypted note", diagnosis: "STAGING TEST clinician-entered text", prescriptions: [{ medicationName: "STAGING TEST medication", dosage: "STAGING TEST", frequency: "STAGING TEST", duration: "STAGING TEST", instructions: "STAGING TEST" }] });
      expect(result.status).toBe(201); const visit = await result.json();
      const stored = await admin.from("consultations").select("notes_encrypted,diagnosis_encrypted").eq("id", visit.id).single();
      expect(stored.error).toBeNull(); expect(stored.data?.notes_encrypted).not.toContain("STAGING TEST");
      expect(open(stored.data!.notes_encrypted, process.env.MEDICAL_DATA_ENCRYPTION_KEY!)).toBe("STAGING TEST encrypted note");
      const owner = called.patient_id === identities.patient.patientId ? "patient" : "other_patient";
      const other = owner === "patient" ? "other_patient" : "patient";
      expect((await clients[owner].from("consultations").select("id").eq("id", visit.id).single()).status).toBe(200);
      expect((await clients[other].from("consultations").select("id").eq("id", visit.id).single()).status).toBe(406);
      expect((await clients[owner].from("prescriptions").select("id").eq("consultation_id", visit.id).single()).status).toBe(200);
      expect((await api(owner, "/records")).status).toBe(200); expect((await api(owner, "/prescriptions")).status).toBe(200);
      expect((await admin.from("queue_entries").select("status").eq("id", called.id).single()).data?.status).toBe("completed");
      const deadline = Date.now() + 10000; while (!eventReceived && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      expect(eventReceived).toBe(true);
      // End the remaining synthetic wait using the existing staff operation.
      const remaining = snapshots.find(snapshot => snapshot.ownEntry.id !== called.id).ownEntry.id;
      expect((await api("receptionist", "/api/queue/actions", { action: "complete", entryId: remaining })).status).toBe(200);
    } finally { await clients.patient.removeChannel(channel); }
  }, 90000);

  it("hosted reserved Storage denies enumeration, download and signing to all application roles", async () => {
    const bucket = await admin.storage.getBucket("clinical-private"); expect(bucket.error).toBeNull(); expect(bucket.data?.public).toBe(false);
    const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`;
    expect((await admin.storage.from("clinical-private").upload(path, Buffer.from("STAGING TEST private file"), { contentType: "application/pdf" })).error).toBeNull();
    try {
      const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      for (const client of [anonymous, ...Object.values(clients)]) {
        expect((await client.storage.from("clinical-private").list(path.split("/")[0])).data ?? []).toEqual([]);
        expect((await client.storage.from("clinical-private").download(path)).error).not.toBeNull();
        expect((await client.storage.from("clinical-private").createSignedUrl(path, 60)).error).not.toBeNull();
      }
      const signed = await admin.storage.from("clinical-private").createSignedUrl(path, 60);
      expect(signed.error).toBeNull(); expect((await fetch(signed.data!.signedUrl)).status).toBe(200);
    } finally { expect((await admin.storage.from("clinical-private").remove([path])).error).toBeNull(); }
  });

  it("hosted database prevents two overlapping synthetic appointments", async () => {
    const start = new Date(Date.now() + 60 * 86400000), end = new Date(start.getTime() + 15 * 60000);
    const results = await Promise.all(["patient", "other_patient"].map(role => admin.from("appointments").insert({ clinic_id: clinic, patient_id: identities[role].patientId, doctor_id: identities.doctor.doctorId, starts_at: start.toISOString(), ends_at: end.toISOString(), reason: "STAGING TEST collision", booked_by: identities.admin.id }).select("id").single()));
    expect(results.filter(result => !result.error)).toHaveLength(1);
    expect(results.filter(result => ["23P01", "23505"].includes(result.error?.code ?? ""))).toHaveLength(1);
    // Preserve the surviving synthetic row as evidence; never delete hosted history.
  });
});
