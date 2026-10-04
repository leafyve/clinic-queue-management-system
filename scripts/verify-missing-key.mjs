import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const url="http://127.0.0.1:54321",app="http://127.0.0.1:3101";
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== url) throw new Error("Local-only missing-key verification refused remote database");
const fixture=JSON.parse(readFileSync(".local-verification/identities.json","utf8"));
const jar=new Map();
const doctor=createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{ cookies:{ getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value)) } });
assert.equal((await doctor.auth.signInWithPassword({ email:fixture.identities.doctor.email,password:fixture.password })).error,null);
const cookie=[...jar].map(([name,value])=>`${name}=${encodeURIComponent(value)}`).join("; ");
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const count=async()=> (await admin.from("consultations").select("id").eq("clinic_id",fixture.identities.doctor.clinicId)).data.length;
const jobs=async()=> (await admin.from("notifications").select("id,status,attempts").order("id")).data;
const beforeCount=await count(),beforeJobs=await jobs();
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port","3101","--hostname","127.0.0.1"],{
  stdio:"ignore",env:{...process.env,APP_ENV:"LOCAL",NEXT_PUBLIC_APP_ENV:"LOCAL",NEXT_PUBLIC_LOCAL_PREVIEW:"false",MEDICAL_DATA_ENCRYPTION_KEY:"",WHATSAPP_ACCESS_TOKEN:"",WHATSAPP_PHONE_NUMBER_ID:""},
});
try {
  const deadline=Date.now()+20000;
  while (true) {
    try { if ((await fetch(`${app}/login`)).status===200) break; } catch {}
    if (Date.now()>deadline || child.exitCode!==null) throw new Error("Missing-key app did not start; run npm run build first and keep port 3101 free");
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const headers={Cookie:cookie,Origin:app,"Content-Type":"application/json"};
  assert.equal((await fetch(`${app}/api/consultations?patientId=${fixture.identities.patient.patientId}`)).status,401);
  const denied=await fetch(`${app}/api/consultations?patientId=${fixture.identities.patient.patientId}`,{headers});
  assert.equal(denied.status,500); assert.match((await denied.json()).error,/could not complete/);
  const {data:entry,error}=await admin.from("queue_entries").select("id").eq("patient_id",fixture.identities.patient.patientId).in("status",["waiting","called","in_consultation"]).single();
  assert.equal(error,null);
  const write=await fetch(`${app}/api/consultations`,{method:"POST",headers,body:JSON.stringify({queueEntryId:entry.id,patientId:fixture.identities.patient.patientId,doctorId:fixture.identities.doctor.doctorId,chiefComplaint:"LOCAL TEST missing key",notes:"LOCAL TEST must never persist",diagnosis:"LOCAL TEST",prescriptions:[]})});
  assert.equal(write.status,500); assert.equal(await count(),beforeCount);
  const worker=await fetch(`${app}/api/notifications/process`,{method:"POST",headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}});
  assert.equal(worker.status,500); assert.deepEqual(await jobs(),beforeJobs);
  console.log("Missing-key verification passed: unauthorized 401; authorized clinical read/write and worker 500; no clinical write or notification claim committed.");
} finally {
  child.kill("SIGTERM");
}
