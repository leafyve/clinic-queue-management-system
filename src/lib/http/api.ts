import "server-only";

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { headers } from "next/headers";

import { getSessionProfile } from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { operationalEvent } from "@/lib/observability/events";

export async function requireApiRole(roles: AppRole[]) {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  const protocol=requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim() ?? "http";
  let sameOrigin = !origin;
  try { if (origin) { const supplied=new URL(origin); sameOrigin=Boolean(host && supplied.host===host && supplied.protocol===`${protocol}:` && ["http","https"].includes(protocol)); } } catch { sameOrigin = false; }
  if (!sameOrigin) {
    return { error: NextResponse.json({ error: "Cross-origin request denied" }, { status: 403 }) } as const;
  }
  const profile = await getSessionProfile();
  if (!profile) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) } as const;
  if (!roles.includes(profile.role)) return { error: NextResponse.json({ error: "You do not have permission for this action" }, { status: 403 }) } as const;
  return { profile } as const;
}

export async function parseJson<T>(request: Request, schema: ZodType<T>) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return { error: NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 }) } as const;
    return { data: parsed.data } as const;
  } catch {
    return { error: NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 }) } as const;
  }
}

export async function enforceRateLimit(_request: NextRequest, scope: string, maxRequests = 30, windowSeconds = 60) {
  if (!process.env.SUPABASE_SECRET_KEY) return false;
  const profile = await getSessionProfile();
  if (!profile) return false;
  // Bind to verified identity; an attacker cannot reset the bucket with forwarded IP headers.
  const key = createHash("sha256").update(`${scope}:${profile.id}`).digest("hex");
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", { key_hash: key, max_requests: maxRequests, window_seconds: windowSeconds });
  return !error && data === true;
}

export function apiError(error: unknown) {
  const suppliedCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "internal";
  const code = /^[A-Z0-9]{5}$/.test(suppliedCode) ? suppliedCode : "internal";
  operationalEvent("api_failure", code);
  if (code === "42501") return NextResponse.json({ error: "You do not have permission for this record" }, { status: 403 });
  if (["23505", "23P01", "23503", "P0001"].includes(code)) return NextResponse.json({ error: "This operation conflicts with the current clinic state" }, { status: 409 });
  return NextResponse.json({ error: "The clinic service could not complete this request." }, { status: 500 });
}
