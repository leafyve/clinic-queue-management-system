import type { QueueSnapshot } from "./types";

export const DEMO_CLINIC_ID = "10000000-0000-4000-8000-000000000001";
export const DEMO_PATIENT_ID = "20000000-0000-4000-8000-000000000001";
export const DEMO_DOCTOR_ID = "30000000-0000-4000-8000-000000000001";

export const demoQueueSnapshot: QueueSnapshot = {
  clinicId: DEMO_CLINIC_ID,
  paused: false,
  queueOpen: true,
  serving: "A043",
  patientsAhead: 3,
  estimatedWaitMinutes: 32,
  estimateReason: "calculated",
  averageConsultationMinutes: 11,
  ownEntry: { id: "40000000-0000-4000-8000-000000000052", queueNumber: "A047", patientName: "John Tan", patientId: DEMO_PATIENT_ID, priority: "normal", status: "waiting", joinedAt: new Date().toISOString() },
  waiting: [
    { id: "40000000-0000-4000-8000-000000000044", queueNumber: "A044", patientName: "Mei Ling", patientId: "20000000-0000-4000-8000-000000000044", priority: "urgent", status: "waiting", joinedAt: "2026-09-29T01:05:00Z", reason: "High fever" },
    { id: "40000000-0000-4000-8000-000000000045", queueNumber: "A045", patientName: "Ravi K.", patientId: "20000000-0000-4000-8000-000000000045", priority: "normal", status: "waiting", joinedAt: "2026-09-29T01:10:00Z" },
    { id: "40000000-0000-4000-8000-000000000046", queueNumber: "A046", patientName: "Nur Aisyah", patientId: "20000000-0000-4000-8000-000000000046", priority: "normal", status: "waiting", joinedAt: "2026-09-29T01:15:00Z" },
    { id: "40000000-0000-4000-8000-000000000052", queueNumber: "A047", patientName: "John Tan", patientId: DEMO_PATIENT_ID, priority: "normal", status: "waiting", joinedAt: "2026-09-29T01:20:00Z" },
  ],
  updatedAt: new Date().toISOString(),
};
