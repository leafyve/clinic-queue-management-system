"use client";
import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { CalendarCheck, Check, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { appointmentReasons } from "@/lib/validation/schemas";
import { appointmentTimes } from "@/lib/appointments/slots";

const times = appointmentTimes;
export function BookingForm({ configured, signedIn }: { configured: boolean; signedIn: boolean }) {
  const dates = useMemo(() => Array.from({ length: 10 }, (_, index) => addDays(new Date(), index + 1)).filter((date) => date.getDay() !== 0), []);
  const [date, setDate] = useState(format(dates[0], "yyyy-MM-dd")); const [time, setTime] = useState("10:30"); const [reason, setReason] = useState<string>(appointmentReasons[2]); const [busy, setBusy] = useState(false); const [confirmed, setConfirmed] = useState<string | null>(null);
  const [available, setAvailable] = useState<string[]>(configured ? [] : times);
  useEffect(() => {
    if (!configured || !signedIn) return;
    let cancelled = false;
    fetch(`/api/appointments?date=${date}`, { cache:"no-store" }).then(async response => {
      if (!response.ok) throw new Error("Slot lookup failed");
      const slots = await response.json() as string[];
      if (!cancelled) setAvailable(times.filter(slot => slots.includes(new Date(`${date}T${slot}:00+08:00`).toISOString())));
    }).catch(() => { if (!cancelled) setAvailable([]); });
    return () => { cancelled = true; };
  }, [date, configured, signedIn]);
  async function book() { if (!signedIn) return toast.error("Sign in with your mobile number before booking."); setBusy(true); const startsAt = new Date(`${date}T${time}:00+08:00`).toISOString(); const response = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startsAt, reason }) }); const body = await response.json(); setBusy(false); if (!response.ok) return toast.error(body.error ?? "Could not book this time"); setConfirmed(startsAt); toast.success("Appointment booked."); }
  if (confirmed) return <div className="surface grid place-items-center p-8 text-center"><span className="grid size-14 place-items-center rounded-full bg-secondary text-primary"><Check /></span><h2 className="mt-5 text-3xl font-semibold">Your visit is booked</h2><p className="mt-3 text-muted-foreground">{format(new Date(confirmed), "EEEE, d MMMM yyyy 'at' h:mm a")}</p><p className="mt-6 max-w-md text-sm leading-6 text-muted-foreground">We’ll send a WhatsApp reminder the day before. You can check in to the live queue when you arrive.</p></div>;
  return <div className="surface overflow-hidden"><div className="border-b bg-secondary/60 px-6 py-5"><h2 className="flex items-center gap-2 text-2xl font-semibold"><CalendarCheck className="text-primary" /> Choose a visit</h2></div><div className="space-y-7 p-6"><div><Label htmlFor="date">Date</Label><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{dates.slice(0, 5).map((day) => { const value = format(day, "yyyy-MM-dd"); return <button key={value} onClick={() => setDate(value)} className={`rounded-xl border p-3 text-center ${date === value ? "border-primary bg-secondary text-primary" : "bg-white hover:border-primary"}`}><span className="block text-xs font-bold">{format(day, "EEE")}</span><span className="mt-1 block text-xl font-bold">{format(day, "d")}</span></button>; })}</div></div><div><Label htmlFor="time">Available time</Label><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">{times.map((slot) => <button key={slot} disabled={configured && !available.includes(slot)} onClick={() => setTime(slot)} className={`flex items-center justify-center gap-1 rounded-xl border px-3 py-3 font-bold ${time === slot ? "border-primary bg-primary text-white" : "bg-white hover:border-primary"}`}><Clock3 className="size-4" />{slot}</button>)}</div></div><div><Label htmlFor="reason">Reason for visit</Label><select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-white px-4 text-base">{appointmentReasons.map((item) => <option key={item}>{item}</option>)}</select></div><Button size="lg" className="w-full" onClick={book} disabled={busy || !configured || !available.includes(time)}>{busy ? "Booking…" : configured ? signedIn ? "Confirm appointment" : "Sign in to book" : "Connect Supabase to book"}</Button></div></div>;
}
