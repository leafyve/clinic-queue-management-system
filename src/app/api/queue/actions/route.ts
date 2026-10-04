import { NextResponse, type NextRequest } from "next/server";

import { getQueueSnapshot } from "@/lib/data/queue";
import { apiError, parseJson, requireApiRole } from "@/lib/http/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enqueueNotification, enqueueApproachingNotifications } from "@/lib/notifications/outbox";
import { queueActionSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const auth = await requireApiRole(["receptionist", "doctor", "admin"]); if ("error" in auth) return auth.error;
  if (!auth.profile.clinicId) return NextResponse.json({ error: "No clinic assignment" }, { status: 409 });
  const parsed = await parseJson(request, queueActionSchema); if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  try {
    const userClient = await createClient(); const admin = createAdminClient();
    if (input.action === "call_next") { const { data: called, error } = await userClient.rpc("call_next_patient", { target_clinic: auth.profile.clinicId }); if (error) throw error; if (called?.id) { const { data: patient } = await admin.from("patients").select("full_name,phone").eq("id", called.patient_id).single(); if (patient) { try { await enqueueNotification({ clinicId: auth.profile.clinicId, patientId: called.patient_id, queueEntryId: called.id, kind: "queue_called", phone: patient.phone, templateName: "queue_called", parameters: [patient.full_name, called.queue_number] }); } catch { console.error("Notification enqueue failed"); } } } }
    else if (input.action === "pause" || input.action === "resume") { const { error } = await userClient.rpc("set_queue_pause", { target_clinic: auth.profile.clinicId, should_pause: input.action === "pause", reason: input.action === "pause" ? input.reason : null }); if (error) throw error; }
    else {
      const { error } = await userClient.rpc("apply_queue_action", { target_clinic: auth.profile.clinicId, entry_id: input.entryId, command: input.action });
      if (error) throw error;
    }
    await enqueueApproachingNotifications(auth.profile.clinicId);
    return NextResponse.json(await getQueueSnapshot());
  } catch (error) { return apiError(error); }
}
