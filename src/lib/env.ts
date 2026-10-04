import { validatePublicEnvironment } from "@/lib/environment";

export function isSupabaseConfigured() {
  return validatePublicEnvironment({ environment: process.env.NEXT_PUBLIC_APP_ENV, url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, preview: process.env.NEXT_PUBLIC_LOCAL_PREVIEW });
}

export function publicSupabaseConfig() {
  if (!isSupabaseConfigured()) throw new Error("Local preview does not have a database");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  return { url, key };
}
