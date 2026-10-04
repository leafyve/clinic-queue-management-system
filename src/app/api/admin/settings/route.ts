import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/data/audit";
import { apiError, parseJson, requireApiRole } from "@/lib/http/api";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ whatsappEnabled: z.boolean() });
export async function PATCH(request: NextRequest) { const auth = await requireApiRole(["admin"]); if ("error" in auth) return auth.error; if (!auth.profile.clinicId) return NextResponse.json({ error: "No clinic assignment" }, { status: 409 }); const parsed = await parseJson(request, schema); if ("error" in parsed) return parsed.error; try { const { error } = await createAdminClient().from("clinic_settings").update({ whatsapp_enabled: parsed.data.whatsappEnabled, updated_by: auth.profile.id }).eq("clinic_id", auth.profile.clinicId); if (error) throw error; await writeAudit({ clinicId: auth.profile.clinicId, actorId: auth.profile.id, action: "settings.notifications_update", entityType: "clinic_settings", entityId: auth.profile.clinicId, metadata: { whatsappEnabled: parsed.data.whatsappEnabled } }); return NextResponse.json({ ok: true }); } catch (error) { return apiError(error); } }
