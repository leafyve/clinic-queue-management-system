import "server-only";
import { medicalEncryptionKey } from "@/lib/server-env";
import { open } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth/session";
import { writeAudit } from "@/lib/data/audit";

export type ClinicalHistory = { patient: { fullName: string; dateOfBirth: string | null; gender: string | null; phone: string; allergies: string }; visits: Array<{ id: string; date: string; complaint: string; diagnosis: string; notes: string; duration: number | null }>; prescriptions: Array<{ id: string; issuedAt: string; doctorName: string; items: Array<{ medication: string; dosage: string; frequency: string; duration: string; instructions: string | null }> }> };

function decrypt(value: string | null, key: string) { if (!value) return "Not recorded"; try { return open(value, key); } catch { return "Encrypted record unavailable"; } }

export async function getClinicalHistory(patientId: string): Promise<ClinicalHistory> {
  const profile = await getSessionProfile();
  if (!profile || (profile.role === "patient" ? profile.patientId !== patientId : !["doctor", "admin"].includes(profile.role))) {
    throw { code: "42501" };
  }
  const admin = createAdminClient(); const key = medicalEncryptionKey();
  const [{ data: patient, error: patientError }, { data: visits, error: visitError }, { data: prescriptions, error: prescriptionError }] = await Promise.all([
    admin.from("patients").select("full_name,date_of_birth,gender,phone,allergies_encrypted").eq("id", patientId).eq("clinic_id", profile.clinicId!).single(),
    admin.from("consultations").select("id,started_at,chief_complaint,diagnosis_encrypted,notes_encrypted,duration_minutes").eq("patient_id", patientId).eq("clinic_id",profile.clinicId!).order("started_at", { ascending: false }),
    admin.from("prescriptions").select("id,issued_at,doctors(display_name),prescription_items(medication_name,dosage,frequency,duration,instructions)").eq("patient_id", patientId).eq("clinic_id",profile.clinicId!).order("issued_at", { ascending: false }),
  ]);
  if (patientError || !patient) throw { code:"42501" };
  if (visitError) throw visitError;
  if (prescriptionError) throw prescriptionError;
  await writeAudit({ clinicId: profile.clinicId!, actorId: profile.id, action: "clinical.read", entityType: "patient", entityId: patientId });
  return { patient: { fullName: patient.full_name, dateOfBirth: patient.date_of_birth, gender: patient.gender, phone: patient.phone, allergies: decrypt(patient.allergies_encrypted, key) }, visits: (visits ?? []).map((visit) => ({ id: visit.id, date: visit.started_at, complaint: visit.chief_complaint ?? "General consultation", diagnosis: decrypt(visit.diagnosis_encrypted, key), notes: decrypt(visit.notes_encrypted, key), duration: visit.duration_minutes })), prescriptions: ((prescriptions ?? []) as Array<{ id: string; issued_at: string; doctors: { display_name: string } | Array<{ display_name: string }>; prescription_items: Array<{ medication_name: string; dosage: string; frequency: string; duration: string; instructions: string | null }> }>).map((rx) => ({ id: rx.id, issuedAt: rx.issued_at, doctorName: (Array.isArray(rx.doctors) ? rx.doctors[0]?.display_name : rx.doctors?.display_name) ?? "Clinic doctor", items: rx.prescription_items.map((item) => ({ medication: item.medication_name, dosage: item.dosage, frequency: item.frequency, duration: item.duration, instructions: item.instructions })) })) };
}

export const demoClinicalHistory: ClinicalHistory = { patient: { fullName: "John Tan", dateOfBirth: "1984-04-18", gender: "male", phone: "+65 9123 4567", allergies: "Penicillin" }, visits: [{ id: "visit-1", date: "2026-08-14T03:10:00Z", complaint: "Fever and sore throat", diagnosis: "Viral upper respiratory tract infection", notes: "Hydration advice given. Review if fever persists beyond 3 days.", duration: 12 }, { id: "visit-2", date: "2026-03-03T02:30:00Z", complaint: "Annual health review", diagnosis: "Well, continue lifestyle measures", notes: "Blood pressure within target range.", duration: 15 }], prescriptions: [{ id: "demo-rx", issuedAt: "2026-08-14T03:22:00Z", doctorName: "Dr Joanne Lin", items: [{ medication: "Paracetamol 500 mg", dosage: "1 tablet", frequency: "3 times daily", duration: "5 days", instructions: "Take after food when needed for fever" }] }] };
