import type { Metadata } from "next";
import { PreviewBanner } from "@/components/preview-banner";
import { QueueLive } from "@/components/queue-live";
import { demoQueueSnapshot } from "@/lib/clinic/demo";
import { getQueueSnapshot } from "@/lib/data/queue";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Live queue" };
export default async function QueuePage() { const configured = isSupabaseConfigured(); const profile = configured ? await getSessionProfile() : null; const snapshot = configured ? await getQueueSnapshot(profile?.patientId) : demoQueueSnapshot; return <><PreviewBanner /><section className="page-shell py-12 md:py-20"><QueueLive initial={snapshot} configured={configured} signedIn={Boolean(profile)} /></section></>; }
