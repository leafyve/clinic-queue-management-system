import { describe, expect, it } from "vitest";

import { appointmentInputSchema, queueJoinSchema } from "./schemas";

describe("patient input validation", () => {
  it("accepts a valid appointment and normalises its reason", () => {
    const result = appointmentInputSchema.safeParse({
      startsAt: "2026-10-02T02:30:00.000Z",
      reason: "  General consultation  ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reason).toBe("General consultation");
  });

  it("rejects queue joins without explicit PDPA consent", () => {
    expect(
      queueJoinSchema.safeParse({ patientId: "b11becde-28b0-49f5-b903-c0d12966b810", consent: false }).success,
    ).toBe(false);
  });
});
