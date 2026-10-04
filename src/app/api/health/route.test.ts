import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
beforeEach(() => {
  vi.stubEnv("APP_ENV", "LOCAL"); vi.stubEnv("NEXT_PUBLIC_APP_ENV", "LOCAL"); vi.stubEnv("NEXT_PUBLIC_LOCAL_PREVIEW", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test"); vi.stubEnv("MEDICAL_DATA_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("reports unavailable database/Auth without returning secret or exception details", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sensitive provider details")));
  const response = await GET(new Request("http://127.0.0.1/api/health"));
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ status: "unavailable" });
});
it("reports missing encryption key safely before any availability probe", async () => {
  vi.stubEnv("MEDICAL_DATA_ENCRYPTION_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await GET(new Request("http://127.0.0.1/api/health"))).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not claim provider or background-job health from public readiness", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { status: 200 })));
  const response = await GET(new Request("http://127.0.0.1/api/health"));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: "ok" });
});
