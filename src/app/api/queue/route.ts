import { NextResponse, type NextRequest } from "next/server";

import { getQueueSnapshot } from "@/lib/data/queue";
import { apiError, enforceRateLimit, parseJson, requireApiRole } from "@/lib/http/api";
import { createClient } from "@/lib/supabase/server";
import { queueJoinSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiRole(["patient", "receptionist", "doctor", "admin"]); if ("error" in auth) return auth.error;
  if (!(await enforceRateLimit(request, "queue-read", 90))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try { return NextResponse.json(await getQueueSnapshot(auth.profile.patientId)); } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiRole(["patient"]); if ("error" in auth) return auth.error;
  if (!auth.profile.patientId || !auth.profile.clinicId) return NextResponse.json({ error: "Complete your patient profile before joining" }, { status: 409 });
  if (!(await enforceRateLimit(request, "queue-join", 5, 300))) return NextResponse.json({ error: "Please wait before trying again" }, { status: 429 });
  const parsed = await parseJson(request, queueJoinSchema.omit({ patientId: true })); if ("error" in parsed) return parsed.error;
  try {
    const client = await createClient();
    const { error } = await client.rpc("join_remote_queue");
    if (error) { if (error.code === "23505") return NextResponse.json({ error: "You already have an active queue number" }, { status: 409 }); throw error; }
    return NextResponse.json(await getQueueSnapshot(auth.profile.patientId), { status: 201 });
  } catch (error) { return apiError(error); }
}
