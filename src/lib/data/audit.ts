import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function writeAudit(input: { clinicId: string; actorId: string; action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const { error } = await createAdminClient().from("audit_logs").insert({ clinic_id: input.clinicId, actor_id: input.actorId, action: input.action, entity_type: input.entityType, entity_id: input.entityId, metadata: input.metadata ?? {} });
  if (error) throw error;
}
