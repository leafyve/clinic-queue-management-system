import { DatabaseZap } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/env";

export function PreviewBanner() {
  if (isSupabaseConfigured()) return null;
  return <div className="border-b border-[#efc78d] bg-[#fff5df] px-4 py-2 text-center text-sm font-bold text-[#704d1f]"><DatabaseZap className="mr-2 inline size-4" /> Preview data — connect Supabase to enable secure sign-in and persistence.</div>;
}
