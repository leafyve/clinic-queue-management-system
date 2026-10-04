// Local rehearsal only: supported PostgreSQL custom-format dump/restore into a
// fresh database in the local container. Never restores over the source.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") throw new Error("Loopback-only restore rehearsal");
const container = "supabase_db_Clinic_Software_System";
const target = `clinic_restore_phase2_${Date.now()}`;
const sql = (db, query) => execFileSync("docker", ["exec", container, "psql", "-X", "-U", "supabase_admin", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { encoding: "utf8" }).trim();
assert.equal(sql("postgres", "select count(*) from public.patients where full_name not like 'LOCAL TEST%';"), "0");
// Known synthetic relationships, with a key kept only in the process environment.
const fixture = JSON.parse(readFileSync(".local-verification/identities.json", "utf8"));
const identity = fixture.identities;
for (const id of [identity.patient.patientId, identity.patient.clinicId, identity.doctor.doctorId, identity.doctor.id]) assert.match(id, /^[0-9a-f-]{36}$/);
const visitId = randomUUID(), prescriptionId = randomUUID();
const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(process.env.MEDICAL_DATA_ENCRYPTION_KEY, "base64"), iv);
const ciphertext = Buffer.concat([cipher.update("LOCAL TEST recovery note", "utf8"), cipher.final()]);
const encrypted = ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
sql("postgres", `begin; insert into public.consultations(id,clinic_id,patient_id,doctor_id,chief_complaint,notes_encrypted,diagnosis_encrypted,ended_at) values('${visitId}','${identity.patient.clinicId}','${identity.patient.patientId}','${identity.doctor.doctorId}','LOCAL TEST recovery complaint','${encrypted}','${encrypted}',now()); insert into public.prescriptions(id,clinic_id,consultation_id,patient_id,doctor_id) values('${prescriptionId}','${identity.patient.clinicId}','${visitId}','${identity.patient.patientId}','${identity.doctor.doctorId}'); insert into public.prescription_items(prescription_id,medication_name,dosage,frequency,duration,instructions) values('${prescriptionId}','LOCAL TEST medication','LOCAL TEST','LOCAL TEST','LOCAL TEST','LOCAL TEST'); commit;`);
const countQuery = "select json_build_object('patients',(select count(*) from public.patients),'users',(select count(*) from auth.users),'visits',(select count(*) from public.consultations),'prescriptions',(select count(*) from public.prescriptions),'items',(select count(*) from public.prescription_items),'audit',(select count(*) from public.audit_logs),'migrations',(select json_agg(version order by version) from supabase_migrations.schema_migrations))::text";
const inventory = "select json_build_object('tables',(select count(*) from pg_tables where schemaname in ('public','private','auth','storage')),'rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity),'policies',(select count(*) from pg_policies where schemaname in ('public','storage')),'functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')),'indexes',(select count(*) from pg_indexes where schemaname in ('public','private')),'triggers',(select count(*) from information_schema.triggers where trigger_schema in ('public','auth')),'publication',(select json_agg(tablename order by tablename) from pg_publication_tables where pubname='supabase_realtime'))::text";
const before = sql("postgres", countQuery), schemaBefore = sql("postgres", inventory);
mkdirSync(".local-verification/phase2", { recursive: true });
const started = Date.now();
const dump = execFileSync("docker", ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--format=custom", "--no-owner", "--no-acl"], { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
writeFileSync(".local-verification/phase2/local-backup.dump", dump, { mode: 0o600 });
sql("postgres", `create database ${target}`);
const restore = spawnSync("docker", ["exec", "-i", container, "pg_restore", "-U", "supabase_admin", "-d", target, "--no-owner", "--no-acl", "--exit-on-error"], { input: dump, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
if (restore.status !== 0) { writeFileSync(".local-verification/phase2/restore-errors.txt", restore.stderr); throw new Error("Restore rehearsal failed; sanitized target retained for investigation. Source untouched."); }
assert.equal(sql(target, countQuery), before); assert.equal(sql(target, inventory), schemaBefore);
assert.equal(sql(target, "select count(*) from public.consultations c left join public.patients p on p.id=c.patient_id left join public.doctors d on d.id=c.doctor_id where p.id is null or d.id is null"), "0");
const payload = sql(target, `select notes_encrypted from public.consultations where id='${visitId}'`);
let encryptionVerified = false;
if (payload) {
  const [version, iv, tag, value] = payload.split("."); assert.equal(version, "v1");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(process.env.MEDICAL_DATA_ENCRYPTION_KEY, "base64"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(value, "base64url")), decipher.final()]).toString("utf8");
  assert.ok(plaintext.startsWith("LOCAL TEST")); encryptionVerified = true;
}
const evidence = { scope: "LOCAL ONLY; not hosted recovery", target, syntheticVisitId: visitId, syntheticPrescriptionId: prescriptionId, elapsedMs: Date.now() - started, sourceCounts: JSON.parse(before), schema: JSON.parse(schemaBefore), backupSha256: createHash("sha256").update(dump).digest("hex"), encryptionVerified, limitations: "ACL/owner privileges excluded; exact grants/RLS role behavior must be separately exercised after a hosted restore. Storage binaries, hosted Auth settings and secrets are not recovered by this dump. RPO/RTO undefined." };
writeFileSync(".local-verification/phase2/restore-result.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
// Retain safe test target as evidence. Never delete the only source database.
