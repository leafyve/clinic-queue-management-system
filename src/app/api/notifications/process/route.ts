import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { processOutbox } from "@/lib/notifications/worker";
import { apiError } from "@/lib/http/api";
import { operationalEvent } from "@/lib/observability/events";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !timingSafeEqual(createHash("sha256").update(expected).digest(),createHash("sha256").update(supplied).digest())) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  try { const result = await processOutbox(); operationalEvent("notification_worker", undefined, result.processed); return NextResponse.json(result); } catch(error) { return apiError(error); }
}
export const GET = POST;
