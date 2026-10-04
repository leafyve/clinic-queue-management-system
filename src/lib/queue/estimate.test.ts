import { describe, expect, it } from "vitest";

import {
  calculateQueuePosition,
  estimateWait,
  historicalAverageMinutes,
  type QueueCandidate,
} from "./estimate";

describe("historicalAverageMinutes", () => {
  it("trims extreme consultations before calculating the prediction", () => {
    expect(historicalAverageMinutes([4, 10, 11, 12, 13, 30])).toBe(12);
  });

  it("uses twelve minutes when there is not enough history", () => {
    expect(historicalAverageMinutes([8, 15])).toBe(12);
  });
});

describe("estimateWait", () => {
  it.each([[0,0],[1,12],[5,60],[-1,0],[NaN,0]])("calculates a finite wait for %s patients ahead", (ahead,minutes) => {
    expect(estimateWait({ patientsAhead:ahead,historicalDurationsMinutes:[],currentConsultationElapsedMinutes:0,paused:false,doctorAvailable:true })).toEqual({ minutes,reason:"calculated" });
  });
  it("uses zero remaining time for an overdue consultation", () => {
    expect(estimateWait({ patientsAhead:2,historicalDurationsMinutes:[12,12,12],currentConsultationElapsedMinutes:99,hasCurrentConsultation:true,paused:false,doctorAvailable:true }).minutes).toBe(12);
  });
  it("returns unavailable for an absent doctor and restores a finite estimate on resume", () => {
    const input = { patientsAhead:2,historicalDurationsMinutes:[9,10,11],currentConsultationElapsedMinutes:0,paused:false,doctorAvailable:false };
    expect(estimateWait(input).reason).toBe("doctor_unavailable");
    expect(estimateWait({...input,doctorAvailable:true}).minutes).toBe(20);
  });
  it("counts the current patient once and adds only the remaining consultation", () => {
    expect(
      estimateWait({
        patientsAhead: 3,
        historicalDurationsMinutes: [10, 11, 12, 13, 14],
        currentConsultationElapsedMinutes: 5,
        paused: false,
        doctorAvailable: true,
        hasCurrentConsultation: true,
      }),
    ).toEqual({ minutes: 31, reason: "calculated" });
  });

  it("does not present a false estimate while the queue is paused", () => {
    expect(
      estimateWait({
        patientsAhead: 2,
        historicalDurationsMinutes: [12, 12, 12],
        currentConsultationElapsedMinutes: 0,
        paused: true,
        doctorAvailable: true,
      }),
    ).toEqual({ minutes: null, reason: "queue_paused" });
  });
});

describe("calculateQueuePosition", () => {
  const queue: QueueCandidate[] = [
    { id: "normal-first", priority: "normal", status: "waiting", joinedAt: "2026-09-29T01:00:00Z" },
    { id: "target", priority: "normal", status: "waiting", joinedAt: "2026-09-29T01:05:00Z" },
    { id: "emergency-later", priority: "emergency", status: "waiting", joinedAt: "2026-09-29T01:10:00Z" },
    { id: "done", priority: "emergency", status: "completed", joinedAt: "2026-09-29T00:30:00Z" },
  ];

  it("places later emergency patients ahead while ignoring completed entries", () => {
    expect(calculateQueuePosition(queue, "target")).toEqual({ position: 3, patientsAhead: 2 });
  });
  it("preserves the active consultation before an emergency and defers skipped normals", () => {
    const entries: QueueCandidate[] = [
      {id:"serving",status:"in_consultation",priority:"normal",joinedAt:"2026-10-04T01:00:00Z"},
      {id:"skip",status:"skipped",priority:"normal",joinedAt:"2026-10-04T01:01:00Z"},
      {id:"waiting",status:"waiting",priority:"normal",joinedAt:"2026-10-04T01:02:00Z"},
      {id:"emergency",status:"waiting",priority:"emergency",joinedAt:"2026-10-04T01:03:00Z"},
    ];
    expect(calculateQueuePosition(entries,"serving")?.patientsAhead).toBe(0);
    expect(calculateQueuePosition(entries,"emergency")?.patientsAhead).toBe(1);
    expect(calculateQueuePosition(entries,"waiting")?.patientsAhead).toBe(2);
    expect(calculateQueuePosition(entries,"skip")?.patientsAhead).toBe(3);
    expect(calculateQueuePosition([...entries,{...entries[0],status:"completed"}],"missing")).toBeNull();
  });
});
