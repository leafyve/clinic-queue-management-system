import { addMinutes } from "date-fns";
import { NextResponse, type NextRequest } from "next/server";

import { writeAudit } from "@/lib/data/audit";
import { apiError, enforceRateLimit, parseJson, requireApiRole } from "@/lib/http/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueNotification } from "@/lib/notifications/outbox";
import { appointmentInputSchema } from "@/lib/validation/schemas";
import { isAppointmentSlot, slotsForDate } from "@/lib/appointments/slots";

export async function GET(request: NextRequest) {
  const auth = await requireApiRole(["patient", "receptionist", "doctor", "admin"]); if ("error" in auth) return auth.error;
  const admin = createAdminClient();
  const date = request.nextUrl.searchParams.get("date");
  if (date) {
    const candidates = slotsForDate(date).filter(slot => new Date(slot) > new Date());
    if (!candidates.length) return NextResponse.json([]);
    const { data: doctor } = await admin.from("doctors").select("id,staff!inner(clinic_id)").eq("staff.clinic_id", auth.profile.clinicId!).eq("is_available", true).limit(1).maybeSingle();
    if (!doctor) return NextResponse.json([]);
    const { data, error } = await admin.from("appointments").select("starts_at,ends_at").eq("doctor_id", doctor.id).in("status", ["scheduled", "checked_in"]).gte("ends_at", candidates[0]).lte("starts_at", candidates[candidates.length-1]);
    if (error) return apiError(error);
    return NextResponse.json(candidates.filter(slot => !(data ?? []).some(row => new Date(row.starts_at).getTime() < new Date(slot).getTime()+15*60000 && new Date(row.ends_at).getTime() > new Date(slot).getTime())));
  }
  const query = admin.from("appointments").select("id,starts_at,ends_at,reason,status");
  const { data, error } = await (auth.profile.patientId ? query.eq("patient_id", auth.profile.patientId) : query.eq("clinic_id", auth.profile.clinicId!)).order("starts_at", { ascending: false });
  return error ? apiError(error) : NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiRole(["patient"]); if ("error" in auth) return auth.error;
  if (!auth.profile.patientId || !auth.profile.clinicId) return NextResponse.json({ error: "Complete your patient profile before booking" }, { status: 409 });
  if (!(await enforceRateLimit(request, "appointment-book", 8, 300))) return NextResponse.json({ error: "Please wait before trying again" }, { status: 429 });
  const parsed = await parseJson(request, appointmentInputSchema); if ("error" in parsed) return parsed.error;
  const startsAt = new Date(parsed.data.startsAt); if (startsAt <= new Date()) return NextResponse.json({ error: "Choose a future appointment time" }, { status: 400 });
  if (!isAppointmentSlot(parsed.data.startsAt)) return NextResponse.json({ error: "Choose one of the available appointment slots" }, { status: 400 });
  try {
    const admin = createAdminClient(); const { data: doctor } = await admin.from("doctors").select("id,staff!inner(clinic_id)").eq("staff.clinic_id", auth.profile.clinicId).eq("is_available", true).limit(1).single();
    if (!doctor) return NextResponse.json({ error: "No doctor is available for this slot" }, { status: 409 });
    const { data, error } = await admin.from("appointments").insert({ clinic_id: auth.profile.clinicId, patient_id: auth.profile.patientId, doctor_id: doctor.id, starts_at: startsAt.toISOString(), ends_at: addMinutes(startsAt, 15).toISOString(), reason: parsed.data.reason, booked_by: auth.profile.id }).select("id,starts_at,status").single();
    if (error) { if (["23505", "23P01"].includes(error.code)) return NextResponse.json({ error: "That time was just booked. Choose another slot." }, { status: 409 }); throw error; }
    await writeAudit({ clinicId: auth.profile.clinicId, actorId: auth.profile.id, action: "appointment.book", entityType: "appointment", entityId: data.id });
    const { data: patient } = await admin.from("patients").select("full_name,phone").eq("id", auth.profile.patientId).single();
    if (patient) { try { await enqueueNotification({ clinicId: auth.profile.clinicId, patientId: auth.profile.patientId, appointmentId: data.id, kind: "appointment_reminder", phone: patient.phone, templateName: "appointment_reminder", parameters: [patient.full_name, startsAt.toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" })], scheduledFor: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000).toISOString() }); } catch { console.error("Notification enqueue failed"); } }
    return NextResponse.json(data, { status: 201 });
  } catch (error) { return apiError(error); }
}
