export type QueueRow = {
  id: string;
  queueNumber: string;
  patientName: string;
  patientId: string;
  priority: "normal" | "urgent" | "emergency";
  status: "waiting" | "called" | "in_consultation" | "skipped" | "completed" | "cancelled" | "left";
  joinedAt: string;
  sequenceNumber?: number;
  reason?: string | null;
};

export type QueueSnapshot = {
  clinicId: string;
  paused: boolean;
  pauseReason?: string | null;
  queueOpen: boolean;
  serving: string | null;
  patientsAhead: number;
  estimatedWaitMinutes: number | null;
  estimateReason: string;
  ownEntry: QueueRow | null;
  currentEntry?: QueueRow | null;
  waiting: QueueRow[];
  averageConsultationMinutes: number;
  updatedAt: string;
};
