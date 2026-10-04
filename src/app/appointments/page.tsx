import type { Metadata } from "next";
import { BookingForm } from "@/components/booking-form";
import { PreviewBanner } from "@/components/preview-banner";
import { getSessionProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Book appointment" };
export default async function AppointmentsPage() { const configured = isSupabaseConfigured(); const profile = configured ? await getSessionProfile() : null; return <><PreviewBanner /><section className="page-shell py-12 md:py-16"><div className="mb-9 max-w-2xl"><p className="font-bold text-primary">Plan ahead</p><h1 className="mt-3 text-5xl font-semibold tracking-tight">Book an appointment</h1><p className="mt-4 text-lg leading-7 text-muted-foreground">Choose a preferred time. Urgent symptoms and emergencies should not wait for an online appointment.</p></div><div className="grid gap-7 lg:grid-cols-[1fr_300px]"><BookingForm configured={configured} signedIn={Boolean(profile)} /><aside className="surface h-fit p-6"><h2 className="text-2xl font-semibold">Before you book</h2><ul className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground"><li>Appointments are 15-minute arrival windows.</li><li>Bring your identification and current medication list.</li><li>Call <a className="font-bold text-primary" href="tel:+6567606014">6760 6014</a> if symptoms worsen.</li></ul><div className="mt-6 rounded-xl bg-[#ffe9e2] p-4 text-sm font-bold text-[#7e3024]">Chest pain, severe breathlessness, or loss of consciousness: call 995.</div></aside></div></section></>; }
