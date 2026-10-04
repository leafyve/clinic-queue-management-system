import { PreviewBanner } from "@/components/preview-banner";
import { StaffQueueConsole } from "@/components/staff-queue-console";
import { WorkspaceHeader } from "@/components/workspace-header";
import { getSessionProfile, requirePageAccess } from "@/lib/auth/session";
import { demoQueueSnapshot } from "@/lib/clinic/demo";
import { getQueueSnapshot } from "@/lib/data/queue";
import { isSupabaseConfigured } from "@/lib/env";

export default async function StaffPage() { const configured = isSupabaseConfigured(); if (configured) await requirePageAccess("/staff"); const profile = configured ? await getSessionProfile() : null; const snapshot = configured ? await getQueueSnapshot() : demoQueueSnapshot; return <><PreviewBanner /><WorkspaceHeader title="Reception desk" role={profile?.role ?? "Preview"} links={[{ href: "/staff", label: "Queue" }, { href: "/appointments", label: "Appointments" }, { href: "/doctor", label: "Doctor" }, { href: "/admin", label: "Admin" }]} /><section className="page-shell py-8"><div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-bold text-primary">{new Date(snapshot.updatedAt).toLocaleDateString("en-SG", { timeZone:"Asia/Singapore",weekday:"long",day:"numeric",month:"long" })}</p><h2 className="mt-1 text-4xl font-semibold">Good afternoon</h2></div><p className="text-sm text-muted-foreground">Last update {new Date(snapshot.updatedAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", timeZone:"Asia/Singapore" })}</p></div><StaffQueueConsole initial={snapshot} configured={configured} /></section></>; }
