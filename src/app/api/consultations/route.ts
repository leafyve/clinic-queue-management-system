import { NextResponse, type NextRequest } from "next/server";
import { apiError, parseJson, requireApiRole } from "@/lib/http/api";
import { medicalEncryptionKey } from "@/lib/server-env";
import { seal } from "@/lib/security/encryption";
import { createClient } from "@/lib/supabase/server";
import { getClinicalHistory } from "@/lib/data/clinical";
import { consultationInputSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiRole(["patient", "doctor", "admin"]); if ("error" in auth) return auth.error;
  const patientId = request.nextUrl.searchParams.get("patientId") ?? auth.profile.patientId;
  if (!patientId) return NextResponse.json({ error: "Patient required" }, { status: 400 });
  try { return NextResponse.json(await getClinicalHistory(patientId)); } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiRole(["doctor", "admin"]); if ("error" in auth) return auth.error;
  const parsed = await parseJson(request, consultationInputSchema); if ("error" in parsed) return parsed.error;
  try {
    const key = medicalEncryptionKey();
    const client = await createClient();
    const input = parsed.data;
    const { data, error } = await client.rpc("complete_consultation", {
      entry_id: input.queueEntryId, target_patient: input.patientId, target_doctor: input.doctorId,
      complaint: input.chiefComplaint, encrypted_notes: seal(input.notes, key),
      encrypted_diagnosis: seal(input.diagnosis, key), items: input.prescriptions,
    });
    if (error) throw error;
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (error) { return apiError(error); }
}
