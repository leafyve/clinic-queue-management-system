"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "@/lib/env";

export function createClient() {
  const { url, key } = publicSupabaseConfig();
  return createBrowserClient(url, key);
}
