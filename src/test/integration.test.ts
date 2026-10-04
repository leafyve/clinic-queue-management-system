import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { beforeAll, describe, expect, it } from "vitest";
import { open, seal } from "@/lib/security/encryption";
import { enqueueNotification, enqueueApproachingNotifications } from "@/lib/notifications/outbox";
import { processOutbox } from "@/lib/notifications/worker";
import { buildWhatsAppTemplatePayload, NotificationDeliveryError } from "@/lib/notifications/whatsapp";

type Identity = { id: string; email: string; patientId?: string; staffId?: string; doctorId?: string; clinicId: string };
const enabled = process.env.LOCAL_TEST_APP_URL === "http://127.0.0.1:3100";
const suite = describe.skipIf(!enabled);
const url = "http://127.0.0.1:54321";
const appUrl = "http://127.0.0.1:3100";
const clinicId = "10000000-0000-4000-8000-000000000001";
let admin: SupabaseClient;
let identities: Record<string, Identity>;
const clients: Record<string, SupabaseClient> = {};
const cookies: Record<string, string> = {};
const transitions: Array<Record<string, unknown>> = [];
const key = () => process.env.MEDICAL_DATA_ENCRYPTION_KEY!;

async function api(role: string | null, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return fetch(`${appUrl}${path}`, { method, redirect: "manual", headers: {
    "Content-Type": "application/json", Origin: appUrl, ...(role ? { Cookie: cookies[role] } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function action(action: string, entryId?: string, role = "receptionist") {
  return api(role, "/api/queue/actions", { action, ...(entryId ? { entryId } : {}), ...(action === "pause" ? { reason: "LOCAL TEST doctor break" } : {}) });
}
async function rowStatus(id: string) {
  const { data, error } = await admin.from("queue_entries").select("status,queue_number,sequence_number").eq("id", id).single();
  expect(error).toBeNull();
  transitions.push({ queueEntryId: id, ...data });
  return data!;
}
async function clearQueue() {
  // Only this fake local clinic, and refuse cleanup if any nonfixture patient exists.
  const { data: patients } = await admin.from("patients").select("full_name").eq("clinic_id", clinicId);
  if (patients?.some((row) => !row.full_name.startsWith("LOCAL TEST"))) throw new Error("Refusing to clear nonfixture data");
  const {data: ownPrescriptions,error: prescriptionError}=await admin.from("prescriptions").select("id").eq("clinic_id",clinicId);
  expect(prescriptionError).toBeNull();
  for (const table of ["notifications", "prescription_items", "prescriptions", "medical_records", "consultations", "queue_entries", "appointments"]) {
    if (table==="prescription_items" && !ownPrescriptions?.length) continue;
    const query = admin.from(table).delete();
    const { error } = table === "prescription_items" ? await query.in("prescription_id",ownPrescriptions!.map(row=>row.id)) : await query.eq("clinic_id", clinicId);
    expect(error, `fixture cleanup ${table}`).toBeNull();
  }
  const { error } = await admin.from("clinic_settings").update({ queue_paused: false, pause_reason: null, queue_open: true, max_remote_queue_size: 40 }).eq("clinic_id", clinicId);
  expect(error).toBeNull();
}
async function fakeQueue(patientId = identities.patient.patientId!, priority = "normal") {
  const { data, error } = await admin.from("queue_entries").insert({ clinic_id: clinicId, patient_id: patientId, priority, source: "walk_in" }).select().single();
  expect(error).toBeNull();
  return data!;
}
function sql(query: string) {
  return execFileSync("docker", ["exec", "supabase_db_Clinic_Software_System", "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", query], { encoding: "utf8" }).trim();
}

suite("local integration and security acceptance", () => {
  beforeAll(async () => {
    process.env.APP_ENV = "LOCAL"; process.env.NEXT_PUBLIC_APP_ENV = "LOCAL"; process.env.NEXT_PUBLIC_LOCAL_PREVIEW = "false";
    if (process.env.NEXT_PUBLIC_SUPABASE_URL !== url || process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_PHONE_NUMBER_ID) throw new Error("Local-only suite refused remote URL/provider credentials");
    const fixture = JSON.parse(readFileSync(".local-verification/identities.json", "utf8"));
    identities = fixture.identities;
    admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    sql("delete from private.rate_limit_buckets");
    for (const [role, identity] of Object.entries(identities)) {
      const jar = new Map<string, string>();
      clients[role] = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (items) => items.forEach(({ name, value }) => jar.set(name, value)),
      } });
      const { error } = await clients[role].auth.signInWithPassword({ email: identity.email, password: fixture.password });
      expect(error, `real local auth ${role}`).toBeNull();
      cookies[role] = [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    }
  }, 60000);

  it("maps five fake Auth identities to users/patients/staff/doctors", async () => {
    for (const [role, identity] of Object.entries(identities)) {
      const { data, error } = await clients[role].from("users").select("role,is_active").eq("id", identity.id).single();
      expect(error).toBeNull(); expect(data?.role).toBe(role.includes("patient") ? "patient" : role); expect(data?.is_active).toBe(true);
    }
  });

  it("health checks probe Auth/PostgREST and restrict operational detail to the worker secret", async () => {
    const publicHealth = await fetch(`${appUrl}/api/health`);
    expect(publicHealth.status).toBe(200); expect(await publicHealth.json()).toEqual({ status: "ok" });
    const health = await fetch(`${appUrl}/api/health`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ environment: "LOCAL", checks: { database: "available", auth: "available", whatsapp: "not_configured" } });
  });

  it("reserved Storage is private and denied to anonymous/patient/staff/doctor/admin identities", async () => {
    const { data: bucket, error } = await admin.storage.getBucket("clinical-private");
    expect(error).toBeNull(); expect(bucket?.public).toBe(false);
    const path = `${randomUUID()}/${randomUUID()}.pdf`;
    expect((await admin.storage.from("clinical-private").upload(path, Buffer.from("STAGING TEST synthetic file"), { contentType: "application/pdf" })).error).toBeNull();
    try {
      const anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      for (const client of [anonymous, ...Object.values(clients)]) {
        const list = await client.storage.from("clinical-private").list(path.split("/")[0]);
        expect(list.data ?? []).toEqual([]);
        expect((await client.storage.from("clinical-private").download(path)).error).not.toBeNull();
        expect((await client.storage.from("clinical-private").createSignedUrl(path, 60)).error).not.toBeNull();
      }
      const signed = await admin.storage.from("clinical-private").createSignedUrl(path, 60);
      expect(signed.error).toBeNull();
      expect((await fetch(signed.data!.signedUrl)).status).toBe(200);
    } finally { expect((await admin.storage.from("clinical-private").remove([path])).error).toBeNull(); }
  });

  it("patient can update own permitted name but cannot change active status or role", async () => {
    const client = clients.patient;
    const permitted = await client.from("users").update({ full_name: "LOCAL TEST Patient updated" }).eq("id", identities.patient.id).select("full_name").single();
    expect(permitted.error).toBeNull();
    for (const patch of [{ is_active: false }, { role: "admin" }]) {
      const result = await client.from("users").update(patch).eq("id", identities.patient.id);
      expect(result.error?.code).toBe("42501");
      await admin.from("users").update({ is_active: true, role: "patient" }).eq("id", identities.patient.id);
    }
  });

  it("patient profile ownership and clinical columns are protected", async () => {
    const permitted = await clients.patient.from("patients").update({ date_of_birth: "1990-01-01" }).eq("id", identities.patient.patientId!).select("id").single();
    expect(permitted.error).toBeNull();
    for (const patch of [{ allergies_encrypted: "PLAINTEXT ATTACK" }, { clinic_id: randomUUID() }, { user_id: identities.other_patient.id }]) {
      const result = await clients.patient.from("patients").update(patch).eq("id", identities.patient.patientId!);
      expect(result.error?.code).toBe("42501");
    }
    const other = await clients.patient.from("patients").select("id").eq("id", identities.other_patient.patientId!).single();
    expect(other.error?.code).toBe("PGRST116"); expect(other.status).toBe(406);
  });

  it("patient cannot access staff/admin rows or privileged RPCs", async () => {
    expect((await clients.patient.from("staff").select("id")).data).toEqual([]);
    expect((await clients.patient.from("doctors").select("id")).data).toEqual([]);
    const directory = await clients.patient.from("staff").select("id").single();
    expect(directory.status).toBe(406);
    expect((await clients.patient.from("audit_logs").select("id").single()).status).toBe(406);
    expect((await clients.patient.rpc("call_next_patient", { target_clinic: clinicId })).error).not.toBeNull();
    expect((await action("pause", undefined, "patient")).status).toBe(403);
    expect((await api("doctor", "/api/admin/settings", { whatsappEnabled: false }, "PATCH")).status).toBe(403);
    expect((await api("receptionist", "/api/admin/staff", { fullName: "LOCAL TEST forbidden", email: "forbidden@example.invalid", role: "admin" })).status).toBe(403);
  });

  it("staff cannot read user identities belonging to another clinic", async () => {
    const otherClinic=randomUUID();
    expect((await admin.from("clinics").insert({ id:otherClinic,name:"LOCAL TEST foreign clinic",slug:`local-test-${otherClinic}`,address_lines:["LOCAL TEST"],postal_code:"000000",phone:"19995559999" })).error).toBeNull();
    await admin.from("patients").update({ clinic_id:otherClinic }).eq("id",identities.other_patient.patientId!);
    try {
      expect((await clients.receptionist.from("users").select("id,email").eq("id",identities.other_patient.id).single()).status).toBe(406);
      expect((await api("doctor",`/api/consultations?patientId=${identities.other_patient.patientId}`)).status).toBe(403);
      await admin.from("staff").update({clinic_id:otherClinic}).eq("id",identities.admin.staffId!);
      const foreignAdmin=await api("admin","/admin");
      expect(foreignAdmin.status).toBe(200);
      expect((await foreignAdmin.text()).includes("local-receptionist@example.invalid")).toBe(false);
    } finally {
      await admin.from("staff").update({clinic_id:clinicId}).eq("id",identities.admin.staffId!);
      await admin.from("patients").update({ clinic_id:clinicId }).eq("id",identities.other_patient.patientId!);
      await admin.from("clinics").delete().eq("id",otherClinic);
    }
  });

  it("logout is POST-only, same-origin, and cannot be triggered by link prefetch", async () => {
    expect((await api("patient","/api/auth/signout")).status).toBe(405);
    expect((await fetch(`${appUrl}/api/auth/signout`,{ method:"POST",headers:{ Cookie:cookies.patient,Origin:"https://attacker.invalid" },redirect:"manual" })).status).toBe(403);
    expect((await api("patient","/api/queue")).status).toBe(200);
  });

  it("denies direct patient queue writes and receptionist clinical writes with database errors", async () => {
    expect((await clients.patient.from("queue_entries").insert({ clinic_id: clinicId, patient_id: identities.patient.patientId!, priority: "emergency" })).error?.code).toBe("42501");
    expect((await clients.patient.from("queue_entries").update({ priority:"emergency" }).eq("patient_id",identities.patient.patientId!)).error?.code).toBe("42501");
    expect((await clients.patient.from("consultations").update({ diagnosis_encrypted: "attack" }).eq("patient_id", identities.patient.patientId!)).error?.code).toBe("42501");
    expect((await clients.receptionist.from("patients").update({ allergies_encrypted: "attack" }).eq("id", identities.patient.patientId!)).error?.code).toBe("42501");
    expect((await clients.receptionist.from("consultations").select("id").single()).status).toBe(406);
    expect((await clients.patient.from("audit_logs").update({ action: "attack" }).eq("clinic_id", clinicId)).error?.code).toBe("42501");
    expect((await clients.admin.from("audit_logs").delete().eq("clinic_id", clinicId)).error?.code).toBe("42501");
  });

  it("rejects unauthenticated, cross-origin, inactive, and unassigned users", async () => {
    expect((await api(null, "/api/queue")).status).toBe(401);
    const csrf = await fetch(`${appUrl}/api/queue/actions`, { method: "POST", headers: { Cookie: cookies.receptionist, Origin: "https://attacker.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ action: "resume" }) });
    expect(csrf.status).toBe(403);
    const schemeCsrf=await fetch(`${appUrl}/api/queue/actions`,{ method:"POST",headers:{ Cookie:cookies.receptionist,Origin:"https://127.0.0.1:3100","Content-Type":"application/json" },body:JSON.stringify({action:"resume"}) });
    expect(schemeCsrf.status).toBe(403);
    await admin.from("users").update({ is_active: false }).eq("id", identities.receptionist.id);
    expect((await action("resume")).status).toBe(401);
    await admin.from("users").update({ is_active: true }).eq("id", identities.receptionist.id);
    await admin.from("staff").update({ role:"admin" }).eq("id",identities.receptionist.staffId!);
    expect((await action("resume")).status).toBe(401);
    expect((await clients.receptionist.rpc("call_next_patient",{ target_clinic:clinicId })).error?.code).toBe("42501");
    await admin.from("staff").update({ role:"receptionist" }).eq("id",identities.receptionist.staffId!);
    const { data: assignment }=await admin.from("staff").select("*").eq("id",identities.receptionist.staffId!).single();
    await admin.from("staff").delete().eq("id",identities.receptionist.staffId!);
    expect((await action("resume")).status).toBe(401);
    await admin.from("staff").insert(assignment!);
    expect((await clients.patient.auth.updateUser({ data:{ role:"admin",clinic_id:clinicId } })).error).toBeNull();
    expect((await api("patient","/api/admin/settings",{ whatsappEnabled:false },"PATCH")).status).toBe(403);
  });

  it("does not disclose other patients through the queue API", async () => {
    await clearQueue(); const other=await fakeQueue(identities.other_patient.patientId!);
    expect((await clients.other_patient.from("queue_entries").select("id").eq("id",other.id).single()).status).toBe(200);
    expect((await clients.patient.from("queue_entries").select("id").eq("id",other.id).single()).status).toBe(406);
    const response = await api("patient", "/api/queue"); expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain(identities.other_patient.patientId!); expect(raw).not.toContain("LOCAL TEST other_patient");
  });

  it("denies clinical history IDOR and suppresses shared caching", async () => {
    expect((await api("patient", `/api/consultations?patientId=${identities.other_patient.patientId}`)).status).toBe(403);
    expect((await api("receptionist", `/api/consultations?patientId=${identities.patient.patientId}`)).status).toBe(403);
    const own = await api("patient", `/api/consultations?patientId=${identities.patient.patientId}`);
    expect(own.status).toBe(200); expect(own.headers.get("cache-control")).toContain("no-store");
  });

  it("executes patient → reception → doctor → history/prescription with encrypted storage", async () => {
    await clearQueue();
    const joined = await api("patient", "/api/queue", { consent: true }); expect(joined.status).toBe(201);
    const snapshot = await joined.json(); const entryId = snapshot.ownEntry.id;
    expect(snapshot.ownEntry.queueNumber).toMatch(/^A\d+$/); expect((await rowStatus(entryId)).status).toBe("waiting");
    expect((await clients.patient.from("queue_entries").select("id").eq("id",entryId).single()).status).toBe(200);
    expect((await action("call_next")).status).toBe(200); expect((await rowStatus(entryId)).status).toBe("called");
    expect((await action("call_next")).status).toBe(200);
    const calledJob=await admin.from("notifications").select("template_name,template_parameters_encrypted").eq("queue_entry_id",entryId).eq("kind","queue_called");
    expect(calledJob.data).toHaveLength(1); expect(calledJob.data![0].template_name).toBe("queue_called");
    expect(JSON.parse(open(calledJob.data![0].template_parameters_encrypted,key()))).toEqual(["LOCAL TEST patient",snapshot.ownEntry.queueNumber]);
    const doctorPage = await api("doctor", "/doctor"); expect(await doctorPage.text()).toContain(snapshot.ownEntry.queueNumber);
    expect((await action("start", entryId, "doctor")).status).toBe(200); expect((await rowStatus(entryId)).status).toBe("in_consultation");
    const startedAt = new Date(Date.now() - 12 * 60000).toISOString();
    await admin.from("queue_entries").update({ consultation_started_at: startedAt }).eq("id", entryId);
    const body = { queueEntryId: entryId, patientId: identities.patient.patientId, doctorId: identities.doctor.doctorId,
      chiefComplaint: "LOCAL TEST Fever", notes: "LOCAL TEST secret clinical note", diagnosis: "LOCAL TEST viral illness",
      prescriptions: [{ medicationName: "LOCAL TEST Paracetamol", dosage: "1 tablet", frequency: "3 times daily", duration: "3 days", instructions: "LOCAL TEST with food" }] };
    expect((await api("receptionist", "/api/consultations", body)).status).toBe(403);
    const complete = await api("doctor", "/api/consultations", body); expect(complete.status).toBe(201);
    const result = await complete.json(); expect((await rowStatus(entryId)).status).toBe("completed");
    const repeated = await api("doctor", "/api/consultations", body); expect([200,409]).toContain(repeated.status);
    const { data: rows } = await admin.from("consultations").select().eq("queue_entry_id", entryId);
    expect(rows).toHaveLength(1); const clinical = rows![0]; expect(clinical.duration_minutes).toBe(Math.ceil((new Date(clinical.ended_at).getTime()-new Date(clinical.started_at).getTime())/60000));
    expect(clinical.notes_encrypted).toMatch(/^v1\./); expect(clinical.notes_encrypted).not.toContain(body.notes);
    expect(open(clinical.notes_encrypted, key())).toBe(body.notes);
    const records = await api("patient", "/records"); expect(records.status).toBe(200); expect(await records.text()).toContain(body.diagnosis);
    expect(await (await api("patient", "/prescriptions")).text()).toContain("LOCAL TEST Paracetamol");
    expect((await clients.other_patient.from("consultations").select("id").eq("id", result.id).single()).status).toBe(406);
    expect((await clients.doctor.from("consultations").select("id").eq("id", result.id).single()).error).toBeNull();
    expect((await clients.receptionist.from("consultations").select("id").eq("id", result.id).single()).status).toBe(406);
    const { data: rx } = await admin.from("prescriptions").select("id").eq("consultation_id", result.id).single();
    expect((await api("patient",`/prescriptions/${rx!.id}/print`)).status).toBe(200);
    expect((await api("doctor",`/prescriptions/${rx!.id}/print`)).status).toBe(200);
    expect((await api("other_patient",`/prescriptions/${rx!.id}/print`)).status).toBe(404);
    expect((await clients.other_patient.from("prescriptions").select("id").eq("id", rx!.id).single()).status).toBe(406);
    expect((await api("patient", `/prescriptions/${randomUUID()}/print`)).status).toBe(404);
    const raw = sql(`select row_to_json(c) from public.consultations c where id='${result.id}'`);
    expect(raw).not.toContain(body.notes); expect(raw).not.toContain(body.diagnosis);
    await admin.from("consultations").update({ notes_encrypted:"v1.invalid.invalid.invalid" }).eq("id",result.id);
    const invalid = await api("doctor",`/api/consultations?patientId=${identities.patient.patientId}`);
    expect(invalid.status).toBe(200); expect(await invalid.text()).toContain("Encrypted record unavailable");
    await admin.from("consultations").update({ notes_encrypted:clinical.notes_encrypted }).eq("id",result.id);
    const allergy=seal("LOCAL TEST synthetic allergy",key());
    await admin.from("patients").update({ allergies_encrypted:allergy }).eq("id",identities.patient.patientId!);
    expect(await (await api("doctor",`/api/consultations?patientId=${identities.patient.patientId}`)).text()).toContain("LOCAL TEST synthetic allergy");
    expect(sql(`select allergies_encrypted from public.patients where id='${identities.patient.patientId}'`)).not.toContain("LOCAL TEST synthetic allergy");
    expect((await clients.patient.from("prescription_items").select("id").eq("prescription_id",rx!.id)).data).toHaveLength(1);
    expect((await clients.other_patient.from("prescription_items").select("id").eq("prescription_id",rx!.id).single()).status).toBe(406);
    writeFileSync(".local-verification/transitions.json", JSON.stringify(transitions, null, 2));
  }, 60000);

  it("rejects clinical IDOR and rolls back a bad prescription atomically", async () => {
    await clearQueue(); const entry = await fakeQueue(); await action("start", entry.id, "doctor");
    const base = { queueEntryId: entry.id, patientId: identities.patient.patientId, doctorId: identities.doctor.doctorId, chiefComplaint: "LOCAL TEST", notes: "LOCAL TEST note", diagnosis: "LOCAL TEST diagnosis", prescriptions: [] };
    expect((await api("doctor", "/api/consultations", { ...base, patientId: identities.other_patient.patientId })).status).toBe(403);
    expect((await api("doctor", "/api/consultations", { ...base, prescriptions: [{ medicationId: randomUUID(), medicationName: "LOCAL TEST", dosage: "1", frequency: "daily", duration: "1 day" }] })).status).toBe(409);
    const { data } = await admin.from("consultations").select("id").eq("queue_entry_id", entry.id); expect(data).toHaveLength(0);
    expect((await rowStatus(entry.id)).status).toBe("in_consultation");
  });

  it("medical-record RLS permits the owner/doctor and denies other patients/reception", async () => {
    const text="LOCAL TEST private medical-record text";
    const { data: record,error }=await admin.from("medical_records").insert({ clinic_id:clinicId,patient_id:identities.patient.patientId!,record_type:"clinical_note",title:"LOCAL TEST record",content_encrypted:seal(text,key()),created_by:identities.doctor.id }).select("id").single();
    expect(error).toBeNull();
    for(const role of ["patient","doctor"]) expect((await clients[role].from("medical_records").select("id").eq("id",record!.id).single()).status).toBe(200);
    for(const role of ["other_patient","receptionist"]) expect((await clients[role].from("medical_records").select("id").eq("id",record!.id).single()).status).toBe(406);
    expect((await clients.patient.from("medical_records").update({ content_encrypted:"attack" }).eq("id",record!.id)).error?.code).toBe("42501");
    expect(sql(`select content_encrypted from public.medical_records where id='${record!.id}'`)).not.toContain(text);
  });

  it("verifies walk-in, emergency ordering, skip, recall, complete, pause/resume", async () => {
    await clearQueue();
    const walk = await api("receptionist", "/api/walk-ins", { fullName: "LOCAL TEST Walk-in", phone: "+19995550100" }); expect(walk.status).toBe(201);
    const first = (await walk.json()).waiting[0]; const other = await fakeQueue(identities.other_patient.patientId!);
    expect((await action("emergency", other.id)).status).toBe(200);
    const emergency = await rowStatus(other.id); expect(emergency.queue_number).toBe(`${other.queue_number}-E`); expect(emergency.sequence_number).toBe(other.sequence_number);
    expect((await action("call_next")).status).toBe(200); expect((await rowStatus(other.id)).status).toBe("called");
    expect((await action("skip", other.id)).status).toBe(200); expect((await rowStatus(other.id)).status).toBe("skipped");
    expect((await action("recall", other.id)).status).toBe(200); expect((await rowStatus(other.id)).status).toBe("called");
    expect((await action("complete", other.id)).status).toBe(200); expect((await rowStatus(other.id)).status).toBe("completed");
    expect((await action("pause")).status).toBe(200);
    const paused = await (await api("other_patient", "/api/queue")).json(); expect(paused.paused).toBe(true); expect(paused.estimatedWaitMinutes).toBeNull();
    expect((await action("call_next")).status).toBe(409);
    expect((await action("resume")).status).toBe(200); expect((await action("call_next")).status).toBe(200); expect((await rowStatus(first.id)).status).toBe("called");
  }, 60000);

  it("serializes concurrent numbering and call-next, and prevents replay duplicates", async () => {
    await clearQueue();
    const people = await Promise.all(Array.from({ length: 16 }, async (_, i) => {
      const fixture=JSON.parse(readFileSync(".local-verification/identities.json","utf8"));
      const email=`local-concurrency-${i}@example.invalid`;
      const existing=(await admin.auth.admin.listUsers({ perPage:1000 })).data.users.find(user=>user.email===email);
      if (!existing) {
        const created=await admin.auth.admin.createUser({ email,password:fixture.password,email_confirm:true,phone:`199955502${String(i).padStart(2,"0")}`,phone_confirm:true,user_metadata:{ full_name:`LOCAL TEST Concurrent ${i}` } });
        expect(created.error).toBeNull();
      }
      const patient=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{ auth:{persistSession:false} });
      expect((await patient.auth.signInWithPassword({email,password:fixture.password})).error).toBeNull();
      return patient;
    }));
    const entries = await Promise.all(people.map(async client => {
      const {data,error}=await client.rpc("join_remote_queue"); expect(error).toBeNull(); return data;
    }));
    expect(new Set(entries.map((e) => e.queue_number)).size).toBe(16);
    const numbers = entries.map((e) => e.sequence_number).sort((a,b) => a-b); expect(numbers[15]-numbers[0]).toBe(15);
    await admin.from("queue_entries").update({ joined_at:"2026-10-04T00:00:00Z" }).eq("clinic_id",clinicId);
    const calls = await Promise.all(Array.from({ length: 12 }, () => clients.receptionist.rpc("call_next_patient", { target_clinic: clinicId })));
    for (const call of calls) expect(call.error).toBeNull();
    expect(new Set(calls.map((call) => call.data.id)).size).toBe(1);
    expect(calls[0].data.sequence_number).toBe(numbers[0]);
    expect((await admin.from("queue_entries").select("id").eq("status", "called").eq("clinic_id", clinicId)).data).toHaveLength(1);
    await clearQueue();
    const joins = await Promise.all(Array.from({ length: 4 }, () => api("patient", "/api/queue", { consent: true })));
    expect(joins.map((r) => r.status).filter((s) => s === 201)).toHaveLength(1); expect(joins.every((r) => [201,409].includes(r.status))).toBe(true);
    expect((await admin.from("queue_entries").select("id").eq("patient_id", identities.patient.patientId!)).data).toHaveLength(1);
    transitions.push({ concurrentJoins:16, uniqueNumbers:16, concurrentCallNext:12, activeCalled:1 });
  }, 60000);

  it("queue capacity is enforced atomically and numbers remain unique beyond 999", async () => {
    await clearQueue(); await admin.from("clinic_settings").update({ max_remote_queue_size:1 }).eq("clinic_id",clinicId);
    const joins = await Promise.all([clients.patient.rpc("join_remote_queue"),clients.other_patient.rpc("join_remote_queue")]);
    expect(joins.filter(r => !r.error)).toHaveLength(1); expect(joins.filter(r => r.error?.code === "P0001")).toHaveLength(1);
    await clearQueue();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Singapore",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
    await admin.from("queue_counters").upsert({ clinic_id:clinicId,queue_date:date,last_number:999 });
    const next = await fakeQueue(); expect(next.queue_number).toBe("A1000");
  });

  it("concurrent replay of walk-in registration commits one patient and one queue entry", async () => {
    await clearQueue();
    const payload={ fullName:`LOCAL TEST Walk-in Replay ${randomUUID()}`,phone:"+19995550444",dateOfBirth:"1995-01-01" };
    const replies=await Promise.all(Array.from({length:4},()=>api("receptionist","/api/walk-ins",payload)));
    expect(replies.every(reply=>reply.status===201)).toBe(true);
    const patients=await admin.from("patients").select("id").eq("full_name",payload.fullName);
    expect(patients.data).toHaveLength(1);
    const entries=await admin.from("queue_entries").select("id").eq("patient_id",patients.data![0].id);
    expect(entries.data).toHaveLength(1);
  },30000);

  it("authenticated rate limits cannot be bypassed with forged forwarded IPs", async () => {
    await clearQueue();
    sql("delete from private.rate_limit_buckets");
    const responses = [];
    for(let i=0;i<6;i++) responses.push(await fetch(`${appUrl}/api/queue`, { headers:{ Cookie:cookies.patient,"x-forwarded-for":`10.0.0.${i}` },method:"POST",body:JSON.stringify({ consent:true }) }));
    expect(responses.slice(0,5).map(response=>response.status)).toEqual([201,409,409,409,409]);
    expect(responses.at(-1)?.status).toBe(429);
    expect((await clients.patient.rpc("consume_rate_limit",{ key_hash:"attack",max_requests:999999,window_seconds:1 })).error?.code).toBe("42501");
  });

  it("appointment collision, available slots, invalid slots, ownership, and reminder time", async () => {
    await clearQueue();
    const future = new Date(); future.setUTCDate(future.getUTCDate()+2); while (future.getUTCDay() === 0) future.setUTCDate(future.getUTCDate()+1); future.setUTCHours(2,30,0,0);
    const startsAt = future.toISOString(); const input = { startsAt, reason: "LOCAL TEST General consultation" };
    const book = await api("patient", "/api/appointments", input); expect(book.status).toBe(201); const appointment = await book.json();
    expect((await clients.patient.from("appointments").select("id").eq("id",appointment.id).single()).status).toBe(200);
    expect((await api("other_patient", "/api/appointments", input)).status).toBe(409);
    const invalid = new Date(future); invalid.setUTCMinutes(31); expect((await api("other_patient", "/api/appointments", { ...input, startsAt: invalid.toISOString() })).status).toBe(400);
    const date = startsAt.slice(0,10); const slots = await api("other_patient", `/api/appointments?date=${date}`); expect(slots.status).toBe(200); expect(JSON.stringify(await slots.json())).not.toContain(startsAt);
    expect((await clients.other_patient.from("appointments").select("id").eq("id", appointment.id).single()).status).toBe(406);
    expect((await clients.patient.from("appointments").update({ status: "completed" }).eq("id", appointment.id)).error?.code).toBe("42501");
    const { data: jobs } = await admin.from("notifications").select("scheduled_for,template_name,template_parameters_encrypted").eq("appointment_id", appointment.id);
    expect(jobs).toHaveLength(1); expect(new Date(jobs![0].scheduled_for).getTime()).toBe(future.getTime()-86400000);
    expect(jobs![0].template_name).toBe("appointment_reminder");
    expect(JSON.parse(open(jobs![0].template_parameters_encrypted,key()))).toEqual(["LOCAL TEST patient",future.toLocaleString("en-SG",{timeZone:"Asia/Singapore",dateStyle:"medium",timeStyle:"short"})]);
    const another=new Date(future); another.setUTCMinutes(0); another.setUTCHours(3);
    const collisions=await Promise.all([api("patient","/api/appointments",{ ...input,startsAt:another.toISOString() }),api("other_patient","/api/appointments",{ ...input,startsAt:another.toISOString() })]);
    expect(collisions.map(response=>response.status).sort()).toEqual([201,409]);
    const checkIn=await fakeQueue();
    await admin.from("queue_entries").update({ appointment_id:appointment.id }).eq("id",checkIn.id);
    expect((await action("start",checkIn.id,"doctor")).status).toBe(200);
    expect((await api("doctor","/api/consultations",{queueEntryId:checkIn.id,patientId:identities.patient.patientId,doctorId:identities.doctor.doctorId,chiefComplaint:"LOCAL TEST linked appointment",notes:"LOCAL TEST linked visit",diagnosis:"LOCAL TEST",prescriptions:[]})).status).toBe(201);
    expect((await admin.from("appointments").select("status").eq("id",appointment.id).single()).data?.status).toBe("completed");
  }, 60000);

  it("predicts waits from controlled PostgreSQL history and actual consultation elapsed time", async () => {
    await clearQueue();
    const history = [4,10,11,12,13,30].map((duration,index) => ({ clinic_id:clinicId,patient_id:identities.patient.patientId!,doctor_id:identities.doctor.doctorId!,started_at:new Date(Date.now()-86400000-index*3600000-duration*60000).toISOString(),ended_at:new Date(Date.now()-86400000-index*3600000).toISOString() }));
    expect((await admin.from("consultations").insert(history)).error).toBeNull();
    const own=await fakeQueue(); let snapshot=await (await api("patient","/api/queue")).json();
    expect(snapshot.averageConsultationMinutes).toBe(12); expect(snapshot.patientsAhead).toBe(0); expect(snapshot.estimatedWaitMinutes).toBe(0);
    const emergency=await fakeQueue(identities.other_patient.patientId!,"emergency");
    snapshot=await (await api("patient","/api/queue")).json(); expect(snapshot.patientsAhead).toBe(1); expect(snapshot.estimatedWaitMinutes).toBe(12);
    await action("start",emergency.id,"doctor");
    await admin.from("queue_entries").update({ joined_at:new Date(Date.now()-60*60000).toISOString(),consultation_started_at:new Date(Date.now()-5*60000).toISOString() }).eq("id",emergency.id);
    snapshot=await (await api("patient","/api/queue")).json(); expect(snapshot.estimatedWaitMinutes).toBe(7);
    await action("pause"); snapshot=await (await api("patient","/api/queue")).json(); expect(snapshot.estimatedWaitMinutes).toBeNull();
    await action("resume"); snapshot=await (await api("patient","/api/queue")).json(); expect(snapshot.estimatedWaitMinutes).toBe(7);
    await action("complete",emergency.id); snapshot=await (await api("patient","/api/queue")).json(); expect(snapshot.estimatedWaitMinutes).toBe(0);
    await admin.from("doctors").update({ is_available:false }).eq("id",identities.doctor.doctorId!);
    snapshot=await (await api("patient","/api/queue")).json(); expect(snapshot.estimateReason).toBe("doctor_unavailable"); expect(snapshot.estimatedWaitMinutes).toBeNull();
    await admin.from("doctors").update({ is_available:true }).eq("id",identities.doctor.doctorId!);
    await action("skip",own.id); snapshot=await (await api("patient","/api/queue")).json(); expect(snapshot.estimatedWaitMinutes).toBeGreaterThanOrEqual(0);
  },30000);

  it("Realtime emits own queue changes and privacy-safe clinic invalidation", async () => {
    await clearQueue();
    const client = clients.patient; let ownEvent = false; let clinicEvent = false; const observedPatients:string[]=[];
    const channel = client.channel(`acceptance-${randomUUID()}`).on("system", {}, (event) => { console.log("Realtime acknowledgement", { status:event.status,message:event.message }); }).on("postgres_changes", { event:"*", schema:"public", table:"queue_entries", filter:`clinic_id=eq.${clinicId}` }, payload => { if ("patient_id" in payload.new) { observedPatients.push(String(payload.new.patient_id)); if (payload.new.patient_id===identities.patient.patientId) ownEvent=true; } }).on("postgres_changes", { event:"UPDATE", schema:"public", table:"clinic_settings", filter:`clinic_id=eq.${clinicId}` }, () => { clinicEvent = true; });
    await new Promise<void>((resolve,reject) => { channel.subscribe((status) => { if(status === "SUBSCRIBED") resolve(); if(status === "CHANNEL_ERROR") reject(new Error("Realtime channel failed")); }); });
    // A fresh db reset cold-starts the tenant. WebSocket join can precede the
    // PostgreSQL CDC registration; verify that registration rather than sleep.
    const readyDeadline=Date.now()+15000;
    while (Number(sql(`select count(*) from realtime.subscription where claims->>'sub'='${identities.patient.id}' and entity in ('public.queue_entries'::regclass,'public.clinic_settings'::regclass)`))<2 && Date.now()<readyDeadline) await new Promise(resolve=>setTimeout(resolve,100));
    expect(Number(sql(`select count(*) from realtime.subscription where claims->>'sub'='${identities.patient.id}' and entity in ('public.queue_entries'::regclass,'public.clinic_settings'::regclass)`))).toBeGreaterThanOrEqual(2);
    await fakeQueue(); await fakeQueue(identities.other_patient.patientId!);
    const deadline = Date.now()+10000; while ((!ownEvent || !clinicEvent) && Date.now()<deadline) await new Promise(resolve => setTimeout(resolve,50));
    await client.removeChannel(channel); expect(ownEvent).toBe(true); expect(clinicEvent).toBe(true);
    expect(observedPatients).not.toContain(identities.other_patient.patientId);
  }, 40000);

  it("admin actions and clinical/queue changes create immutable audit records", async () => {
    expect((await api("admin", "/api/admin/settings", { whatsappEnabled:false }, "PATCH")).status).toBe(200);
    const response = await api("admin", "/api/admin/staff", { fullName:"LOCAL TEST Invited Reception", email:`local-invited-${randomUUID()}@example.invalid`, role:"receptionist" }); expect(response.status).toBe(201);
    expect((await api("admin", "/admin")).status).toBe(200);
    const { data, error } = await clients.admin.from("audit_logs").select("action").eq("clinic_id", clinicId); expect(error).toBeNull();
    const actions = data!.map(row => row.action);
    for (const name of ["queue.emergency","queue.pause","queue.resume","staff.invite","settings.notifications_update","consultation.complete","prescription.create"]) expect(actions).toContain(name);
    expect(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity")).toBe("16");
    writeFileSync(".local-verification/transitions.json", JSON.stringify(transitions,null,2));
  }, 30000);

  it("mocked outbox success, concurrent claims, bounded retries, scheduling, dedup, and provider gate", async () => {
    await clearQueue(); const entry = await fakeQueue();
    await Promise.all(Array.from({ length:4 }, () => enqueueApproachingNotifications(clinicId)));
    let jobs = await admin.from("notifications").select("id,status,attempts,destination_encrypted,template_parameters_encrypted").eq("queue_entry_id",entry.id);
    expect(jobs.data).toHaveLength(1); expect(jobs.data![0].destination_encrypted).toMatch(/^v1\./);
    expect((await clients.patient.from("notifications").select("id").eq("id",jobs.data![0].id).single()).status).toBe(200);
    expect((await clients.other_patient.from("notifications").select("id").eq("id",jobs.data![0].id).single()).status).toBe(406);
    expect((await clients.patient.rpc("claim_notifications",{ batch_size:25 })).error?.code).toBe("42501");
    const sent: string[] = [];
    const originalKey=process.env.MEDICAL_DATA_ENCRYPTION_KEY;
    delete process.env.MEDICAL_DATA_ENCRYPTION_KEY;
    try { await expect(processOutbox(async () => "must not send")).rejects.toThrow("not configured"); }
    finally { process.env.MEDICAL_DATA_ENCRYPTION_KEY=originalKey; }
    expect((await admin.from("notifications").select("attempts,status").eq("id",jobs.data![0].id).single()).data).toMatchObject({ attempts:0,status:"pending" });
    const transport = async (input: Parameters<typeof buildWhatsAppTemplatePayload>[0]) => {
      const payload=buildWhatsAppTemplatePayload(input); expect(payload.template.name).toBe("queue_approaching");
      expect(payload.template.components[0].parameters[1].text).toBe(entry.queue_number);
      sent.push(input.to); return "LOCAL TEST provider-ack";
    };
    await admin.from("clinic_settings").update({ whatsapp_enabled:false }).eq("clinic_id",clinicId);
    expect((await processOutbox(transport)).processed).toBe(0);
    await admin.from("clinic_settings").update({ whatsapp_enabled:true }).eq("clinic_id",clinicId);
    const concurrent = await Promise.all([processOutbox(transport),processOutbox(transport)]);
    expect(concurrent.reduce((n,r)=>n+r.sent,0)).toBe(1); expect(sent).toHaveLength(1);
    jobs=await admin.from("notifications").select("id,status,attempts,destination_encrypted,template_parameters_encrypted").eq("queue_entry_id",entry.id);
    expect(jobs.data![0].status).toBe("sent"); expect(jobs.data![0].attempts).toBe(1);
    await enqueueNotification({ clinicId,patientId:identities.patient.patientId!,kind:"appointment_reminder",phone:"+19995550001",templateName:"appointment_reminder",parameters:["LOCAL TEST","tomorrow"],scheduledFor:new Date(Date.now()+86400000).toISOString() });
    expect((await processOutbox(transport)).processed).toBe(0);
    const { data: retry } = await admin.from("notifications").insert({ clinic_id:clinicId,patient_id:identities.patient.patientId!,kind:"queue_called",destination_encrypted:jobs.data![0].destination_encrypted,template_parameters_encrypted:jobs.data![0].template_parameters_encrypted,template_name:"queue_called" }).select("id").single();
    let failures=0;
    for(let attempt=1;attempt<=5;attempt++) {
      await admin.from("notifications").update({ scheduled_for:new Date(Date.now()-1000).toISOString() }).eq("id",retry!.id);
      await processOutbox(async () => { failures++; throw new NotificationDeliveryError("LOCAL TEST simulated rejection, sensitive details"); });
    }
    expect(failures).toBe(4);
    const failed = await admin.from("notifications").select("status,attempts,last_error").eq("id",retry!.id).single();
    expect(failed.data).toMatchObject({ status:"failed",attempts:4,last_error:"Delivery attempt failed" });
    await admin.from("notifications").update({ attempts:0,status:"pending" }).eq("id",retry!.id);
    let ambiguous=0;
    await processOutbox(async () => { ambiguous++; throw new Error("LOCAL TEST connection lost after acceptance"); });
    await processOutbox(async () => { ambiguous++; return "unexpected duplicate"; });
    expect(ambiguous).toBe(1);
    expect((await admin.from("notifications").select("status,last_error").eq("id",retry!.id).single()).data).toMatchObject({ status:"processing",last_error:"Delivery outcome requires reconciliation" });
    expect((await api(null,"/api/notifications/process",{})).status).toBe(401);
    await admin.from("clinic_settings").update({ whatsapp_enabled:false }).eq("clinic_id",clinicId);
    const authorizedWorker=await fetch(`${appUrl}/api/notifications/process`,{method:"POST",headers:{ Authorization:`Bearer ${process.env.CRON_SECRET}` }});
    expect(authorizedWorker.status).toBe(200);
    expect(await authorizedWorker.json()).toMatchObject({processed:0,sent:0});
  }, 30000);
});
