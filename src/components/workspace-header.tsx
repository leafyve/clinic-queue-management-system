import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import "server-only";
import { isLocalDemoEnvironment } from "@/lib/environment";

export function WorkspaceHeader({ title, role, links }: { title: string; role: string; links: Array<{ href: string; label: string }> }) {
  const demo = isLocalDemoEnvironment(process.env);
  return <div className="border-b bg-white"><div className="page-shell flex min-h-20 flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{title}</h1><Badge variant="secondary" className="gap-1"><ShieldCheck className="size-3" />{role}</Badge></div><p className="text-sm text-muted-foreground">Jo-Lin Family Clinic · Limbang</p></div>{demo && <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm"><p className="font-bold text-amber-900">DEMO MODE · LOCAL · synthetic data only</p><p className="mt-1 text-amber-900">SMS OTP &amp; WhatsApp: production integration pending · Cloud hosting: staging pending</p></div>}<nav className="flex flex-wrap items-center gap-1">{links.map((link) => <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground">{link.label}</Link>)}<form action="/api/auth/signout" method="post"><button type="submit" className="rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="mr-1 inline size-4" /> Sign out</button></form></nav></div></div>;
}
