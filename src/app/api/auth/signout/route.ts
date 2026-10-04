import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiRole, apiError } from "@/lib/http/api";

export async function POST() {
  const auth = await requireApiRole(["patient", "receptionist", "doctor", "admin"]);
  if (auth.error) return auth.error;
  try {
    const client = await createClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    return new NextResponse(null, { status:303, headers:{ Location:"/" } });
  } catch (error) { return apiError(error); }
}
