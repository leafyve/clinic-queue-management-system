import "server-only";
import { medicalEncryptionKey } from "@/lib/server-env";
import { seal } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateQueuePosition } from "@/lib/queue/estimate";
import type { QueuePriority, QueueStatus } from "@/lib/queue/estimate";

export async function enqueueNotification(input: { clinicId: string; patientId: string; queueEntryId?: string; appointmentId?: string; kind: string; phone: string; templateName: string; parameters: string[]; scheduledFor?: string }) {
  const key = medicalEncryptionKey();
  const { error } = await createAdminClient().from("notifications").insert({ clinic_id: input.clinicId, patient_id: input.patientId, queue_entry_id: input.queueEntryId, appointment_id: input.appointmentId, kind: input.kind, destination_encrypted: seal(input.phone, key), template_name: input.templateName, template_parameters_encrypted: seal(JSON.stringify(input.parameters), key), scheduled_for: input.scheduledFor ?? new Date().toISOString() });
  if (error && error.code !== "23505") throw error;
}

export async function enqueueApproachingNotifications(clinicId: string) {
  const admin = createAdminClient();
  const { data: settings, error: settingsError } = await admin.from("clinic_settings").select("approaching_threshold,queue_paused").eq("clinic_id",clinicId).single();
  if (settingsError) throw settingsError;
  if (settings.queue_paused) return;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Singapore",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
  const { data: rows, error } = await admin.from("queue_entries").select("id,patient_id,queue_number,priority,status,joined_at,sequence_number").eq("clinic_id",clinicId).eq("queue_date",date).in("status",["waiting","called","in_consultation","skipped"]);
  if (error) throw error;
  const candidates = (rows ?? []).map(row => ({ id: row.id, priority:row.priority as QueuePriority,status:row.status as QueueStatus,joinedAt:row.joined_at,sequenceNumber:row.sequence_number }));
  for (const row of rows ?? []) {
    if (row.status !== "called" && (row.status !== "waiting" || (calculateQueuePosition(candidates,row.id)?.patientsAhead ?? Infinity) > settings.approaching_threshold)) continue;
    const { data: patient, error } = await admin.from("patients").select("full_name,phone").eq("id",row.patient_id).single();
    if (error) throw error;
    const kind = row.status === "called" ? "queue_called" : "queue_approaching";
    await enqueueNotification({ clinicId,patientId:row.patient_id,queueEntryId:row.id,kind,phone:patient.phone,templateName:kind,parameters:[patient.full_name,row.queue_number] });
  }
}
