import { AdminConsole } from "@/components/admin-console";
import { PreviewBanner } from "@/components/preview-banner";
import { WorkspaceHeader } from "@/components/workspace-header";
import { getSessionProfile, requirePageAccess } from "@/lib/auth/session";
import { demoAdminSnapshot, getAdminSnapshot } from "@/lib/data/analytics";
import { isSupabaseConfigured } from "@/lib/env";

export default async function AdminPage() { const configured = isSupabaseConfigured(); if (configured) await requirePageAccess("/admin"); const profile = configured ? await getSessionProfile() : null; const data = configured ? await getAdminSnapshot() : demoAdminSnapshot; return <><PreviewBanner /><WorkspaceHeader title="Clinic administration" role={profile?.role ?? "Preview"} links={[{ href: "/admin", label: "Analytics" }, { href: "/staff", label: "Reception" }, { href: "/doctor", label: "Doctor" }]} /><section className="page-shell py-8"><div className="mb-7"><p className="font-bold text-primary">Operations</p><h2 className="mt-1 text-4xl font-semibold">Clinic overview</h2></div><AdminConsole data={data} configured={configured} /></section></>; }
