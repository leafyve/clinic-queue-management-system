import "server-only";

import { CLINIC } from "@/lib/clinic/constants";
import type { QueueRow, QueueSnapshot } from "@/lib/clinic/types";
import { calculateQueuePosition, estimateWait, historicalAverageMinutes } from "@/lib/queue/estimate";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth/session";

function singaporeDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

type RawQueue = { id: string; sequence_number: number; consultation_started_at: string | null; queue_number: string; patient_id: string; priority: QueueRow["priority"]; status: QueueRow["status"]; joined_at: string; priority_reason: string | null; patients: { full_name: string } | Array<{ full_name: string }> | null };

export async function getClinicId() {
  const admin = createAdminClient();
  const { data, error } = await admin.from("clinics").select("id").eq("slug", CLINIC.slug).single();
  if (error) throw error;
  return data.id as string;
}

export async function getQueueSnapshot(patientId?: string): Promise<QueueSnapshot> {
  const profile = await getSessionProfile();
  if (patientId && patientId !== profile?.patientId) throw new Error("Patient queue access denied");
  const staffAccess = Boolean(profile && profile.role !== "patient");
  const admin = createAdminClient();
  const clinicId = await getClinicId();
  if (profile && profile.clinicId !== clinicId) throw { code: "42501" };
  const date = singaporeDate();
  const [{ data: settings, error: settingsError }, { data: rawQueue, error: queueError }, { data: history }, { data: doctor }] = await Promise.all([
    admin.from("clinic_settings").select("queue_paused,pause_reason,queue_open").eq("clinic_id", clinicId).single(),
    admin.from("queue_entries").select("id,sequence_number,consultation_started_at,queue_number,patient_id,priority,status,joined_at,priority_reason,patients(full_name)").eq("clinic_id", clinicId).eq("queue_date", date).in("status", ["waiting", "called", "in_consultation", "skipped"]).order("joined_at").order("sequence_number"),
    admin.from("consultations").select("duration_minutes").eq("clinic_id", clinicId).not("duration_minutes", "is", null).order("ended_at", { ascending: false }).limit(30),
    admin.from("doctors").select("is_available,staff!inner(clinic_id)").eq("staff.clinic_id", clinicId).limit(1).maybeSingle(),
  ]);
  if (settingsError) throw settingsError;
  if (queueError) throw queueError;

  const queue: QueueRow[] = ((rawQueue ?? []) as RawQueue[]).map((entry) => ({
    id: entry.id, queueNumber: entry.queue_number, patientId: entry.patient_id, priority: entry.priority, status: entry.status,
    joinedAt: entry.joined_at, sequenceNumber: entry.sequence_number, reason: entry.priority_reason,
    patientName: Array.isArray(entry.patients) ? entry.patients[0]?.full_name ?? "Patient" : entry.patients?.full_name ?? "Patient",
  }));
  const ownEntry = patientId ? queue.find((entry) => entry.patientId === patientId) ?? null : null;
  const servingEntry = queue.find((entry) => entry.status === "in_consultation" || entry.status === "called");
  const position = ownEntry ? calculateQueuePosition(queue, ownEntry.id) : null;
  const durations = (history ?? []).map((row) => Number(row.duration_minutes)).filter(Boolean);
  const rawServing = (rawQueue as RawQueue[] | null)?.find((entry) => entry.id === servingEntry?.id);
  const currentElapsed = rawServing?.consultation_started_at ? Math.max(0, Math.floor((Date.now() - new Date(rawServing.consultation_started_at).getTime()) / 60_000)) : 0;
  const prediction = estimateWait({ patientsAhead: position?.patientsAhead ?? 0, historicalDurationsMinutes: durations, currentConsultationElapsedMinutes: currentElapsed, hasCurrentConsultation: Boolean(servingEntry), paused: settings.queue_paused, doctorAvailable: doctor?.is_available ?? false });
  const waiting = queue.filter((entry) => entry.status === "waiting" || entry.status === "skipped").sort((a,b) => (calculateQueuePosition(queue,a.id)?.position ?? 0) - (calculateQueuePosition(queue,b.id)?.position ?? 0));
  return { clinicId, paused: settings.queue_paused, pauseReason: settings.pause_reason, queueOpen: settings.queue_open, serving: servingEntry?.queueNumber ?? null, patientsAhead: position?.patientsAhead ?? 0, estimatedWaitMinutes: ownEntry ? prediction.minutes : null, estimateReason: prediction.reason, ownEntry, currentEntry: staffAccess ? servingEntry ?? null : null, waiting: staffAccess ? waiting : [], averageConsultationMinutes: historicalAverageMinutes(durations), updatedAt: new Date().toISOString() };
}
