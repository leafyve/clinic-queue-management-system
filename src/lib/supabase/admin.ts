import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "@/lib/env";

export function createAdminClient() {
  const { url } = publicSupabaseConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
