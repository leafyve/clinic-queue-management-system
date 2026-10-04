// Local fixtures only. Never reads hosted-project credentials from .env.local.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execSync("npx supabase status --output json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:54321" || status.DB_URL !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres") {
  throw new Error("Refusing bootstrap: expected this repository's loopback Supabase stack.");
}
const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } });
const clinicId = "10000000-0000-4000-8000-000000000001";
const { data: clinic, error: clinicError } = await admin.from("clinics").select("name").eq("id", clinicId).single();
if (clinicError || clinic.name !== "Jo-Lin Family Clinic & Surgery") throw new Error("Unexpected clinic seed");
mkdirSync(".local-verification", { recursive: true });
const fixturePath = ".local-verification/identities.json";
const previous = existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, "utf8")) : {};
const password = previous.password ?? randomBytes(24).toString("base64url");
const key = previous.encryptionKey ?? randomBytes(32).toString("base64");
const cronSecret = previous.cronSecret ?? randomBytes(32).toString("base64url");
const identities = {};
const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;
for (const [index, role] of ["patient", "other_patient", "receptionist", "doctor", "admin"].entries()) {
  const email = `local-${role}@example.invalid`;
  let user = existing.users.find((row) => row.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      ...(role.includes("patient") ? { phone: `1999555000${index + 1}`, phone_confirm: true } : {}),
      user_metadata: { full_name: `LOCAL TEST ${role}` } });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
  }
  const appRole = role === "other_patient" ? "patient" : role;
  const { error } = await admin.from("users").update({ role: appRole, full_name: `LOCAL TEST ${role}`, is_active: true }).eq("id", user.id);
  if (error) throw error;
  const identity = { id: user.id, email, role: appRole, clinicId };
  if (appRole === "patient") {
    const { error: clinicAssignmentError }=await admin.from("patients").update({ clinic_id:clinicId }).eq("user_id",user.id);
    if (clinicAssignmentError) throw clinicAssignmentError;
    const { data, error } = await admin.from("patients").select("id").eq("user_id", user.id).single();
    if (error) throw error;
    identity.patientId = data.id;
  } else {
    const { data, error } = await admin.from("staff").upsert({ user_id: user.id, clinic_id: clinicId, role: appRole }, { onConflict: "user_id" }).select("id").single();
    if (error) throw error;
    identity.staffId = data.id;
    if (appRole === "doctor") {
      const { data: doctor, error } = await admin.from("doctors").upsert({ staff_id: data.id, display_name: "LOCAL TEST Doctor" }, { onConflict: "staff_id" }).select("id").single();
      if (error) throw error;
      identity.doctorId = doctor.id;
    }
  }
  identities[role] = identity;
}
writeFileSync(fixturePath, JSON.stringify({ password, encryptionKey: key, cronSecret, identities }, null, 2), { mode: 0o600 });
const env = {
  APP_ENV: "LOCAL",
  NEXT_PUBLIC_APP_ENV: "LOCAL",
  NEXT_PUBLIC_LOCAL_PREVIEW: "false",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  MEDICAL_DATA_ENCRYPTION_KEY: key,
  CRON_SECRET: cronSecret,
  LOCAL_TEST_APP_URL: "http://127.0.0.1:3100",
};
writeFileSync(".env.test.local", Object.entries(env).map(([name, value]) => `${name}=${value}`).join("\n") + "\n", { mode: 0o600 });
console.log("Fake local identities ready: patient, other_patient, receptionist, doctor, admin.");
console.log("Credentials saved only to ignored .local-verification/identities.json and .env.test.local.");
