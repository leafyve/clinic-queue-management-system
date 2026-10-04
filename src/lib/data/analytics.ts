import "server-only";
import { getSessionProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminSnapshot = { dailyPatients: number; averageWait: number; averageConsultation: number; abandonmentRate: number; appointmentCompletion: number; peakHours: Array<{ hour: string; count: number }>; staff: Array<{ id: string; fullName: string; email: string; role: string; active: boolean }>; audit: Array<{ id: number; action: string; createdAt: string; actor: string }> };

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  const profile=await getSessionProfile();
  if (profile?.role !== "admin" || !profile.clinicId) throw { code:"42501" };
  const admin = createAdminClient(); const clinicId = profile.clinicId; const since = new Date(); since.setHours(0, 0, 0, 0);
  const [{ data: queue }, { data: consultations }, { data: appointments }, { data: staffRows }, { data: auditRows }] = await Promise.all([
    admin.from("queue_entries").select("joined_at,called_at,status").eq("clinic_id", clinicId).gte("joined_at", since.toISOString()),
    admin.from("consultations").select("duration_minutes").eq("clinic_id", clinicId).gte("started_at", since.toISOString()),
    admin.from("appointments").select("status").eq("clinic_id", clinicId).gte("starts_at", since.toISOString()),
    admin.from("staff").select("id,role,users(full_name,email,is_active)").eq("clinic_id", clinicId),
    admin.from("audit_logs").select("id,action,created_at,users(full_name)").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(8),
  ]);
  const waits = (queue ?? []).filter((row) => row.called_at).map((row) => (new Date(row.called_at).getTime() - new Date(row.joined_at).getTime()) / 60000);
  const completedAppointments = (appointments ?? []).filter((row) => row.status === "completed").length;
  const terminalQueue = (queue ?? []).filter((row) => ["completed", "left", "cancelled"].includes(row.status));
  const byHour = new Map<number, number>(); for (const row of queue ?? []) { const hour = new Date(row.joined_at).getHours(); byHour.set(hour, (byHour.get(hour) ?? 0) + 1); }
  return {
    dailyPatients: queue?.length ?? 0,
    averageWait: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
    averageConsultation: consultations?.length ? Math.round(consultations.reduce((sum, row) => sum + Number(row.duration_minutes ?? 0), 0) / consultations.length) : 0,
    abandonmentRate: terminalQueue.length ? Math.round((terminalQueue.filter((row) => row.status === "left" || row.status === "cancelled").length / terminalQueue.length) * 100) : 0,
    appointmentCompletion: appointments?.length ? Math.round((completedAppointments / appointments.length) * 100) : 0,
    peakHours: [...byHour.entries()].sort(([a], [b]) => a - b).map(([hour, count]) => ({ hour: `${String(hour).padStart(2, "0")}:00`, count })),
    staff: ((staffRows ?? []) as Array<{ id: string; role: string; users: { full_name: string; email: string; is_active: boolean } | Array<{ full_name: string; email: string; is_active: boolean }> }>).map((row) => { const user = Array.isArray(row.users) ? row.users[0] : row.users; return { id: row.id, fullName: user?.full_name ?? "Staff member", email: user?.email ?? "", role: row.role, active: user?.is_active ?? false }; }),
    audit: ((auditRows ?? []) as Array<{ id: number; action: string; created_at: string; users: { full_name: string } | Array<{ full_name: string }> }>).map((row) => ({ id: row.id, action: row.action, createdAt: row.created_at, actor: (Array.isArray(row.users) ? row.users[0]?.full_name : row.users?.full_name) ?? "System" })),
  };
}

export const demoAdminSnapshot: AdminSnapshot = { dailyPatients: 34, averageWait: 27, averageConsultation: 11, abandonmentRate: 6, appointmentCompletion: 92, peakHours: [{ hour: "08:00", count: 5 }, { hour: "09:00", count: 10 }, { hour: "10:00", count: 8 }, { hour: "11:00", count: 4 }, { hour: "14:00", count: 7 }], staff: [{ id: "1", fullName: "Dr Joanne Lin", email: "doctor@jo-lin.sg", role: "doctor", active: true }, { id: "2", fullName: "Melissa Goh", email: "reception@jo-lin.sg", role: "receptionist", active: true }], audit: [{ id: 1, action: "queue.call_next", createdAt: new Date().toISOString(), actor: "Melissa Goh" }, { id: 2, action: "consultation.complete", createdAt: new Date(Date.now() - 12 * 60000).toISOString(), actor: "Dr Joanne Lin" }] };
