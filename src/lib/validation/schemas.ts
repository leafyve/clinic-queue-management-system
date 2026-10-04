import { z } from "zod";

export const appointmentReasons = [
  "Fever",
  "Flu symptoms",
  "General consultation",
  "Medical checkup",
  "Vaccination",
  "Other",
] as const;

export const appointmentInputSchema = z.object({
  startsAt: z.iso.datetime(),
  reason: z.string().trim().min(2).max(500),
});

export const queueJoinSchema = z.object({
  patientId: z.uuid(),
  consent: z.literal(true, { error: "Consent is required to join the digital queue" }),
});

export const queueActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("call_next") }),
  z.object({ action: z.literal("pause"), reason: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.enum(["recall", "skip", "complete", "start", "emergency"]), entryId: z.uuid() }),
]);

export const consultationInputSchema = z.object({
  queueEntryId: z.uuid(),
  patientId: z.uuid(),
  doctorId: z.uuid(),
  chiefComplaint: z.string().trim().min(2).max(500),
  notes: z.string().trim().min(1).max(20_000),
  diagnosis: z.string().trim().min(1).max(5_000),
  prescriptions: z.array(z.object({
    medicationId: z.uuid().optional(),
    medicationName: z.string().trim().min(1).max(200),
    dosage: z.string().trim().min(1).max(100),
    frequency: z.string().trim().min(1).max(100),
    duration: z.string().trim().min(1).max(100),
    instructions: z.string().trim().max(500).optional(),
  })).max(30),
});
