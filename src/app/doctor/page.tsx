import { DoctorConsole } from "@/components/doctor-console";
import { PreviewBanner } from "@/components/preview-banner";
import { WorkspaceHeader } from "@/components/workspace-header";
import { getSessionProfile, requirePageAccess } from "@/lib/auth/session";
import { demoQueueSnapshot, DEMO_DOCTOR_ID } from "@/lib/clinic/demo";
import { getQueueSnapshot } from "@/lib/data/queue";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClinicalHistory } from "@/lib/data/clinical";

export default async function DoctorPage() { const configured = isSupabaseConfigured(); if (configured) await requirePageAccess("/doctor"); const profile = configured ? await getSessionProfile() : null; const snapshot = configured ? await getQueueSnapshot() : demoQueueSnapshot; let doctorId = DEMO_DOCTOR_ID; if (configured && profile) { const admin = createAdminClient(); const { data: staff } = await admin.from("staff").select("id").eq("user_id", profile.id).maybeSingle(); if (staff) { const { data: doctor } = await admin.from("doctors").select("id").eq("staff_id", staff.id).maybeSingle(); if (doctor) doctorId = doctor.id; } } const patient = snapshot.currentEntry ?? snapshot.waiting[0]; const history = configured && patient ? await getClinicalHistory(patient.patientId) : undefined; return <><PreviewBanner /><WorkspaceHeader title="Consultation room" role={profile?.role ?? "Preview"} links={[{ href: "/doctor", label: "Current patient" }, { href: "/staff", label: "Queue" }, { href: "/admin", label: "Admin" }]} /><section className="page-shell py-8"><div className="mb-7"><p className="font-bold text-primary">Doctor workspace</p><h2 className="mt-1 text-4xl font-semibold">Today’s consultation</h2></div><DoctorConsole key={patient?.id ?? "empty"} initial={snapshot} configured={configured} doctorId={doctorId} history={history} /></section></>; }
