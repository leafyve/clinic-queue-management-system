import { afterEach, expect, it, vi } from "vitest";
import { clinicFetch } from "./client";
afterEach(() => vi.unstubAllGlobals());
it("does not retry an uncertain write and provides actionable failure without losing caller input", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("sensitive network details")); vi.stubGlobal("fetch", fetcher);
  const result = await clinicFetch("/api/consultations", { method: "POST" });
  expect(result.status).toBe(503); expect((await result.json()).error).toContain("may have completed");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("preserves authentication failures and successful JSON responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Authentication required" }, { status: 401 })));
  expect((await clinicFetch("/api/queue")).status).toBe(401);
});
