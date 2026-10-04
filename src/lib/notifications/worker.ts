import "server-only";
import { medicalEncryptionKey } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { open } from "@/lib/security/encryption";
import { enqueueApproachingNotifications } from "@/lib/notifications/outbox";
import { NotificationDeliveryError, sendWhatsAppTemplate, type WhatsAppTemplateInput } from "@/lib/notifications/whatsapp";
import { operationalEvent } from "@/lib/observability/events";

export async function processOutbox(transport: (input: WhatsAppTemplateInput) => Promise<string | null> = sendWhatsAppTemplate) {
  const key = medicalEncryptionKey();
  const admin = createAdminClient();
  const { data: clinics, error: clinicError } = await admin.from("clinic_settings").select("clinic_id").eq("whatsapp_enabled",true);
  if (clinicError) throw clinicError;
  for (const clinic of clinics ?? []) await enqueueApproachingNotifications(clinic.clinic_id);
  const { data: jobs, error } = await admin.rpc("claim_notifications",{ batch_size:25 });
  if (error) throw error;
  let sent = 0;
  for (const job of jobs ?? []) {
    let providerId: string | null;
    try {
      providerId = await transport({ to:open(job.destination_encrypted,key),templateName:job.template_name,parameters:JSON.parse(open(job.template_parameters_encrypted,key)) as string[] });
      if (!providerId) throw new Error("No delivery acknowledgement");
    } catch (cause) {
      const retrySafe = cause instanceof NotificationDeliveryError;
      operationalEvent(retrySafe ? "notification_retry" : "notification_uncertain");
      const { error } = await admin.from("notifications").update(retrySafe
        ? { status:"failed",last_error:"Delivery attempt failed",scheduled_for:new Date(Date.now()+60000*2**(job.attempts-1)).toISOString() }
        : { last_error:"Delivery outcome requires reconciliation" }).eq("id",job.id).eq("status","processing");
      if (error) throw error;
      continue;
    }
    // If persistence fails after the transport accepted a send, retain processing.
    // Do not automatically replay a potentially delivered message.
    const { error } = await admin.from("notifications").update({ status:"sent",sent_at:new Date().toISOString(),provider_message_id:providerId,last_error:null }).eq("id",job.id).eq("status","processing");
    if (error) throw error;
    sent++;
  }
  return { processed:jobs?.length ?? 0,sent };
}
