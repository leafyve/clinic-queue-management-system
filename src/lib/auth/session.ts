import "server-only";

import { redirect } from "next/navigation";

import { canAccess, type AppRole } from "@/lib/auth/permissions";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { operationalEvent } from "@/lib/observability/events";

export type SessionProfile = { id: string; role: AppRole; fullName: string; clinicId?: string; patientId?: string };

export async function getSessionProfile(): Promise<SessionProfile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) operationalEvent("auth_failure");
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;
  const { data: user } = await supabase.from("users").select("id, role, full_name, is_active").eq("id", userId).single();
  if (!user?.is_active) return null;
  const profile: SessionProfile = { id: user.id, role: user.role as AppRole, fullName: user.full_name };
  if (user.role === "patient") {
    const { data: patient } = await supabase.from("patients").select("id, clinic_id").eq("user_id", userId).maybeSingle();
    if (patient) Object.assign(profile, { patientId: patient.id, clinicId: patient.clinic_id });
  } else {
    const { data: staff } = await supabase.from("staff").select("clinic_id,role").eq("user_id", userId).maybeSingle();
    if (staff?.role !== user.role) return null;
    if (staff) profile.clinicId = staff.clinic_id;
  }
  if (!profile.clinicId || (profile.role === "patient" && !profile.patientId)) return null;
  return profile;
}

export async function requirePageAccess(pathname: string) {
  const profile = await getSessionProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(pathname)}`);
  if (!canAccess(profile.role, pathname)) redirect("/unauthorized");
  return profile;
}
