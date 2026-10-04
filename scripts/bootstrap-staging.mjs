// Dedicated staging only. Creates five fake identities; never sends invitations.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { stagingConfig } from "./staging-config.mjs";

const config = stagingConfig();
const file = ".staging-verification/identities.json";
if (existsSync(file)) throw new Error("Existing staging fixture manifest: refusing to overwrite passwords. Inspect partial bootstrap or reuse verified mappings.");
const phones = [process.env.STAGING_PATIENT_A_PHONE, process.env.STAGING_PATIENT_B_PHONE];
if (phones.some(phone => !/^\+\d{8,15}$/.test(phone ?? "")) || phones[0] === phones[1]) throw new Error("Two distinct developer-controlled E.164 phones required; do not use invented routable numbers");
if (process.env.STAGING_CONTROLLED_PHONES_CONFIRM !== "developer-controlled") throw new Error("Confirm ownership of both test phones");
const admin = createClient(config.url, config.secret, { auth: { persistSession: false } });
const manifest = { projectRef: config.ref, appUrl: config.app, complete: false, identities: {} };
mkdirSync(".staging-verification", { recursive: true });
const save = () => writeFileSync(file, JSON.stringify(manifest, null, 2), { mode: 0o600 });
async function checked(result, step) { if (result.error) throw new Error(`Bootstrap step failed: ${step}. Inspect provider privately; do not print request or secret values.`); return result.data; }
const clinic = await checked(await admin.from("clinics").select("id").eq("slug", "jo-lin-family-clinic").single(), "seed lookup");
const patients = await checked(await admin.from("patients").select("id").limit(1), "empty staging check");
const staff = await checked(await admin.from("staff").select("id").limit(1), "empty staff check");
if (patients.length || staff.length) throw new Error("Bootstrap requires a clean dedicated staging clinic; no automatic overwrite or cleanup");
await checked(await admin.from("clinics").update({ name: "STAGING TEST Jo-Lin Clinic" }).eq("id", clinic.id), "synthetic clinic label");
await checked(await admin.from("clinic_settings").update({ whatsapp_enabled: false }).eq("clinic_id", clinic.id), "disable delivery during bootstrap");
save();
for (const [index, name] of ["patient", "other_patient", "receptionist", "doctor", "admin"].entries()) {
  const role = name.includes("patient") ? "patient" : name;
  const email = `staging-${name}@example.invalid`;
  const password = randomBytes(32).toString("base64url");
  const { user } = await checked(await admin.auth.admin.createUser({ email, password, email_confirm: true, ...(role === "patient" ? { phone: phones[index], phone_confirm: false } : {}), user_metadata: { full_name: `STAGING TEST ${name}` } }), "synthetic Auth creation");
  // Persist credentials immediately for recovery from a later partial mapping failure.
  const identity = { id: user.id, email, password, role, clinicId: clinic.id };
  manifest.identities[name] = identity; save();
  await checked(await admin.from("users").update({ role, is_active: true, full_name: `STAGING TEST ${name}` }).eq("id", user.id), "profile role mapping");
  if (role === "patient") {
    const patient = await checked(await admin.from("patients").select("id,clinic_id").eq("user_id", user.id).single(), "patient trigger mapping");
    if (patient.clinic_id !== clinic.id) throw new Error("Unexpected patient clinic mapping");
    identity.patientId = patient.id;
  } else {
    const row = await checked(await admin.from("staff").insert({ user_id: user.id, clinic_id: clinic.id, role }).select("id").single(), "staff mapping");
    identity.staffId = row.id;
    if (role === "doctor") identity.doctorId = (await checked(await admin.from("doctors").insert({ staff_id: row.id, display_name: "STAGING TEST Doctor" }).select("id").single(), "doctor mapping")).id;
  }
  save();
}
manifest.complete = true; save();
console.log("Synthetic staging identities created. Protect the ignored manifest with OS access controls. Password authentication does not verify SMS OTP delivery.");
