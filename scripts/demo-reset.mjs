// Disposable LOCAL stack only; no hosted credentials or dotenv files are read.
import { execSync } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertLocalDemoTarget, assertSyntheticDemoData } from "./local-demo-safety.mjs";

if (process.argv.length !== 2) throw new Error("Demo reset accepts no target/URL arguments");
// Reject inherited hosted configuration before even querying the local stack.
const expected = { API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" };
assertLocalDemoTarget(expected);
const status = JSON.parse(execSync("npx supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assertLocalDemoTarget(status);
// Reset restarts API containers; do not reuse pre-reset keep-alive sockets.
let admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false }, global: { headers: { Connection: "close" } } });
async function rows(table, columns) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from(table).select(columns).range(offset, offset + 999);
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
assertSyntheticDemoData(await rows("patients", "full_name"), await rows("users", "full_name,email"), await rows("clinics", "id"));
// Explicit --local: never --linked, --db-url, or a caller-supplied target.
console.log("Resetting the disposable synthetic LOCAL stack. Existing local sessions must sign in again.");
execSync("npx supabase db reset --local", { stdio: "inherit" });
execSync("node scripts/bootstrap-local.mjs", { stdio: "inherit" });
const refreshedStatus = JSON.parse(execSync("npx supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
assertLocalDemoTarget(refreshedStatus);
admin = createClient(refreshedStatus.API_URL, refreshedStatus.SECRET_KEY, { auth: { persistSession: false }, global: { headers: { Connection: "close" } } });
const fixture = JSON.parse(readFileSync(".local-verification/identities.json", "utf8"));
const { identities, encryptionKey } = fixture;
const clinicId = identities.patient.clinicId;
function encrypted(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(encryptionKey, "base64"), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
async function checked(query) { const { data, error } = await query; if (error) throw error; return data; }
for (const [role, name] of Object.entries({ patient: "Daniel Tan · demo patient", other_patient: "Other patient · isolation check", receptionist: "Reception · demo staff", doctor: "Doctor · demo staff", admin: "Owner · demo admin" })) {
  await checked(admin.from("users").update({ full_name: `DEMO — ${name}` }).eq("id", identities[role].id));
}
await checked(admin.from("patients").update({ full_name: "DEMO — Daniel Tan", date_of_birth: "1984-04-18", allergies_encrypted: encrypted("Synthetic history: penicillin allergy"), consented_at: new Date().toISOString() }).eq("id", identities.patient.patientId));
await checked(admin.from("patients").update({ full_name: "DEMO — Other patient", allergies_encrypted: encrypted("Synthetic history: no known allergies") }).eq("id", identities.other_patient.patientId));
await checked(admin.from("doctors").update({ display_name: "DEMO — Clinic doctor", is_available: true }).eq("id", identities.doctor.doctorId));
await checked(admin.from("clinic_settings").update({ queue_paused: false, pause_reason: null, queue_open: true, whatsapp_enabled: false, max_remote_queue_size: 40 }).eq("clinic_id", clinicId));
const now = new Date();
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const midnight = new Date(`${date}T00:00:00+08:00`).getTime();
// Always in the past; immediately after midnight, analytics correctly excludes yesterday’s rows.
const baseline = now.getTime() - 100 * 60000;
const timestamp = minutes => new Date(baseline + minutes * 60000).toISOString();
const background = [];
for (const [index, name] of ["Alice Wong", "Ben Goh", "Grace Teo", "Sarah Lim", "Michael Lee"].entries()) {
  const patient = await checked(admin.from("patients").insert({ clinic_id: clinicId, full_name: `DEMO — ${name}`, phone: `1999555010${index}`, date_of_birth: "1980-01-01", allergies_encrypted: encrypted("Synthetic history: no known allergies"), consented_at: now.toISOString() }).select("id,full_name").single());
  const completed = index < 3;
  const queue = await checked(admin.from("queue_entries").insert({ clinic_id: clinicId, patient_id: patient.id, source: "walk_in", queue_date: date, status: completed ? "completed" : "waiting", joined_at: timestamp(index * 16), called_at: completed ? timestamp(index * 16 + 6) : null, consultation_started_at: completed ? timestamp(index * 16 + 6) : null, completed_at: completed ? timestamp(index * 16 + 16 + index * 2) : null, created_by: identities.receptionist.id }).select("id,queue_number,status").single());
  if (completed) {
    await checked(admin.from("consultations").insert({ clinic_id: clinicId, patient_id: patient.id, queue_entry_id: queue.id, doctor_id: identities.doctor.doctorId, started_at: timestamp(index * 16 + 6), ended_at: timestamp(index * 16 + 16 + index * 2), chief_complaint: "DEMO — synthetic routine review", notes_encrypted: encrypted("DEMO ONLY — synthetic completed consultation."), diagnosis_encrypted: encrypted("DEMO ONLY — fictional routine review") }));
  }
  background.push({ name: patient.full_name, ...queue });
}
const historyStart = new Date(now.getTime() - 7 * 86400000).toISOString();
const historicalVisit = await checked(admin.from("consultations").insert({ clinic_id: clinicId, patient_id: identities.patient.patientId, doctor_id: identities.doctor.doctorId, started_at: historyStart, ended_at: new Date(new Date(historyStart).getTime() + 12 * 60000).toISOString(), chief_complaint: "DEMO — previous health review", notes_encrypted: encrypted("DEMO ONLY — fictional previous visit. Reviewed general wellbeing; follow-up discussed."), diagnosis_encrypted: encrypted("DEMO ONLY — routine health review") }).select("id").single());
const rx = await checked(admin.from("prescriptions").insert({ clinic_id: clinicId, consultation_id: historicalVisit.id, patient_id: identities.patient.patientId, doctor_id: identities.doctor.doctorId, issued_at: new Date(new Date(historyStart).getTime() + 12 * 60000).toISOString() }).select("id").single());
await checked(admin.from("prescription_items").insert({ prescription_id: rx.id, medication_name: "Paracetamol 500 mg", dosage: "DEMO — 1 tablet", frequency: "DEMO — as recorded", duration: "DEMO — 3 days", instructions: "Synthetic prescription for presentation only; not treatment advice." }));
await checked(admin.from("audit_logs").insert({ clinic_id: clinicId, actor_id: identities.admin.id, action: "demo.reset", entity_type: "clinic", entity_id: clinicId, metadata: { synthetic: true, completedFixtures: 3, waitingFixtures: 2 } }));
writeFileSync(".local-verification/demo-scenario.json", JSON.stringify({ date, patient: "DEMO — Daniel Tan", expectedRemoteNumber: "A006", background, baseline: { patientsToday: background.filter((_, index) => baseline + index * 16 * 60000 >= midnight).length, note: "Analytics derives actual Singapore-day counts and durations; no KPI override." }, synthetic: true }, null, 2));
console.log("DEMO ready: A001–A003 completed; Sarah Lim A004 and Michael Lee A005 waiting; Daniel joins as A006.");
console.log("Local password Auth only. SMS/WhatsApp production integration pending; cloud staging pending.");
