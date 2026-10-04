export type QueuePriority = "normal" | "urgent" | "emergency";
export type QueueStatus = "waiting" | "called" | "in_consultation" | "skipped" | "completed" | "cancelled" | "left";

export type QueueCandidate = {
  id: string;
  priority: QueuePriority;
  status: QueueStatus;
  joinedAt: string;
  sequenceNumber?: number;
};

export type WaitEstimate = {
  minutes: number | null;
  reason: "calculated" | "queue_paused" | "doctor_unavailable";
};

const DEFAULT_CONSULTATION_MINUTES = 12;
const activeStatuses = new Set<QueueStatus>(["waiting", "called", "in_consultation", "skipped"]);
const priorityRank: Record<QueuePriority, number> = { emergency: 0, urgent: 1, normal: 2 };

export function historicalAverageMinutes(durations: number[]): number {
  const valid = durations.filter((duration) => Number.isFinite(duration) && duration >= 1 && duration <= 180);
  if (valid.length < 3) return DEFAULT_CONSULTATION_MINUTES;

  const sorted = [...valid].sort((a, b) => a - b);
  const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
  return Math.round(trimmed.reduce((total, duration) => total + duration, 0) / trimmed.length);
}

export function calculateQueuePosition(entries: QueueCandidate[], targetId: string) {
  const ordered = entries
    .filter((entry) => activeStatuses.has(entry.status))
    .sort((left, right) => {
      const serving = (entry: QueueCandidate) => entry.status === "called" || entry.status === "in_consultation";
      if (serving(left) !== serving(right)) return serving(left) ? -1 : 1;
      const byPriority = priorityRank[left.priority] - priorityRank[right.priority];
      if (byPriority !== 0) return byPriority;
      if ((left.status === "skipped") !== (right.status === "skipped")) return left.status === "skipped" ? 1 : -1;
      return new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime() || (left.sequenceNumber ?? 0) - (right.sequenceNumber ?? 0) || left.id.localeCompare(right.id);
    });
  const index = ordered.findIndex((entry) => entry.id === targetId);
  return index < 0 ? null : { position: index + 1, patientsAhead: index };
}

export function estimateWait(input: {
  patientsAhead: number;
  historicalDurationsMinutes: number[];
  currentConsultationElapsedMinutes: number;
  paused: boolean;
  doctorAvailable: boolean;
  hasCurrentConsultation?: boolean;
}): WaitEstimate {
  if (input.paused) return { minutes: null, reason: "queue_paused" };
  if (!input.doctorAvailable) return { minutes: null, reason: "doctor_unavailable" };

  const average = historicalAverageMinutes(input.historicalDurationsMinutes);
  const ahead = Number.isFinite(input.patientsAhead) ? Math.max(0, Math.floor(input.patientsAhead)) : 0;
  const elapsed = Number.isFinite(input.currentConsultationElapsedMinutes) ? Math.max(0, input.currentConsultationElapsedMinutes) : 0;
  const hasCurrent = input.hasCurrentConsultation ?? false;
  const remainingCurrent = hasCurrent && ahead > 0 ? Math.max(0, average - elapsed) : 0;
  return {
    minutes: remainingCurrent + Math.max(0, ahead - (hasCurrent ? 1 : 0)) * average,
    reason: "calculated",
  };
}
