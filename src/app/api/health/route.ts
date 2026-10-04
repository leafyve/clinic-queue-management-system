import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { validateDeploymentEnvironment } from "@/lib/environment";
import { medicalEncryptionKey } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";
import { operationalEvent } from "@/lib/observability/events";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const checks: Record<string, string | number> = {};
  let healthy = true;
  try {
    if (!validateDeploymentEnvironment(process.env)) throw new Error("Preview");
    medicalEncryptionKey();
    checks.configuration = "available";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    const results = await Promise.all(["/rest/v1/clinics?select=id&limit=1", "/auth/v1/health"].map(async path => {
      try { return (await fetch(`${url}${path}`, { headers: { apikey }, cache: "no-store", signal: AbortSignal.timeout(3000) })).ok; }
      catch { return false; }
    }));
    checks.database = results[0] ? "available" : "unavailable";
    checks.auth = results[1] ? "available" : "unavailable";
    healthy = results.every(Boolean);
  } catch { checks.configuration = "unavailable"; healthy = false; }

  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const authorized = Boolean(secret && timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(supplied).digest()));
  if (authorized) {
    checks.project_ref = process.env.APP_ENV === "STAGING" ? process.env.STAGING_SUPABASE_PROJECT_REF ?? "" : process.env.APP_ENV === "PRODUCTION" ? process.env.PRODUCTION_SUPABASE_PROJECT_REF ?? "" : "loopback";
    checks.whatsapp = process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? "configured_not_probed" : "not_configured";
    if (checks.database === "available") {
      try {
        const admin = createAdminClient();
        const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
        const [uncertain, exhausted] = await Promise.all([
          admin.from("notifications").select("id", { count: "exact", head: true }).eq("status", "processing").lt("updated_at", cutoff).abortSignal(AbortSignal.timeout(3000)),
          admin.from("notifications").select("id", { count: "exact", head: true }).eq("status", "failed").gte("attempts", 4).abortSignal(AbortSignal.timeout(3000)),
        ]);
        if (uncertain.error || exhausted.error) throw new Error();
        checks.notification_uncertain = uncertain.count ?? 0;
        checks.notification_exhausted = exhausted.count ?? 0;
        checks.background_scheduler = "inspect_host_scheduler_logs";
      } catch { checks.worker_database = "unavailable"; healthy = false; }
    }
  }
  if (!healthy) operationalEvent("health_failure");
  return NextResponse.json({ status: healthy ? "ok" : "unavailable", ...(authorized ? { environment: process.env.APP_ENV, checks } : {}) }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
