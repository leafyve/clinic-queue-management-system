import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getQueueSnapshot } from "@/lib/data/queue";
import { apiError, parseJson, requireApiRole } from "@/lib/http/api";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ fullName: z.string().trim().min(2).max(150), phone: z.string().trim().regex(/^[+\d\s-]{8,20}$/), dateOfBirth: z.iso.date().optional() });
export async function POST(request: NextRequest) {
  const auth = await requireApiRole(["receptionist", "doctor", "admin"]); if (auth.error) return auth.error;
  const parsed = await parseJson(request, schema); if (parsed.error) return parsed.error;
  try {
    const client=await createClient();
    const { error }=await client.rpc("add_walk_in_patient",{ full_name_input:parsed.data.fullName,phone_input:parsed.data.phone,birth_input:parsed.data.dateOfBirth ?? null });
    if (error) throw error;
    return NextResponse.json(await getQueueSnapshot(),{ status:201 });
  } catch (error) { return apiError(error); }
}
