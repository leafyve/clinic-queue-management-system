import { Clock3, MapPin, Menu } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="page-shell flex h-[76px] items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary font-heading text-xl font-semibold text-primary-foreground">JL</span>
          <span className="min-w-0 leading-tight"><span className="block truncate font-heading text-lg font-semibold">Jo-Lin Family Clinic</span><span className="hidden text-sm text-muted-foreground sm:block">Limbang Shopping Centre</span></span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-6 md:flex">
          <Link href="/queue" className="font-bold text-muted-foreground hover:text-foreground">Live queue</Link><Link href="/appointments" className="font-bold text-muted-foreground hover:text-foreground">Appointments</Link><Link href="/#visit" className="font-bold text-muted-foreground hover:text-foreground">Visit us</Link><Button asChild><Link href="/login">Sign in</Link></Button>
        </nav>
        <details className="relative md:hidden"><summary aria-label="Open navigation" className="grid size-11 cursor-pointer list-none place-items-center rounded-xl border bg-card"><Menu /></summary><nav className="absolute right-0 mt-3 grid w-56 gap-1 rounded-2xl border bg-card p-2 shadow-xl"><Link className="rounded-lg px-4 py-3 font-bold hover:bg-muted" href="/queue">Live queue</Link><Link className="rounded-lg px-4 py-3 font-bold hover:bg-muted" href="/appointments">Appointments</Link><Link className="rounded-lg px-4 py-3 font-bold hover:bg-muted" href="/login">Sign in</Link></nav></details>
      </div>
      <div className="border-t bg-secondary/60 md:hidden"><div className="page-shell flex h-9 items-center justify-between text-sm font-bold"><span className="flex items-center gap-1.5"><Clock3 className="size-4" /> Clinic hours: see Visit us</span><span className="flex items-center gap-1.5"><MapPin className="size-4" /> CCK Street 51</span></div></div>
    </header>
  );
}
