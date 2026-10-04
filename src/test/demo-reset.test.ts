import { describe, expect, it } from "vitest";
import { assertLocalDemoTarget, assertSyntheticDemoData } from "../../scripts/local-demo-safety.mjs";

const local = { API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" };
describe("destructive demo reset containment", () => {
  it("rejects inherited or supplied hosted/ambiguous targets before reset", () => {
    expect(() => assertLocalDemoTarget(local, {})).not.toThrow();
    for (const env of [{ APP_ENV: "PRODUCTION" }, { NEXT_PUBLIC_APP_ENV: "STAGING" }, { NEXT_PUBLIC_SUPABASE_URL: "https://fake.supabase.co" }, { SUPABASE_URL: "http://localhost.evil.test" }, { DATABASE_URL: "postgresql://example.test/postgres" }]) expect(() => assertLocalDemoTarget(local, env)).toThrow();
    for (const status of [{ ...local, API_URL: "https://fake.supabase.co" }, { ...local, DB_URL: "postgresql://example.test/postgres" }, { ...local, API_URL: "http://127.0.0.1:54321/path" }]) expect(() => assertLocalDemoTarget(status, {})).toThrow();
  });
  it("refuses unknown patients/accounts/additional clinics rather than deleting them", () => {
    const patients = [{ full_name: "DEMO — Daniel Tan" }, { full_name: "LOCAL TEST patient" }];
    const users = [{ full_name: "DEMO — Doctor", email: "local-doctor@example.invalid" }];
    const clinics = [{ id: "10000000-0000-4000-8000-000000000001" }];
    expect(() => assertSyntheticDemoData(patients, users, clinics)).not.toThrow();
    expect(() => assertSyntheticDemoData([{ full_name: "Unknown person" }], users, clinics)).toThrow();
    expect(() => assertSyntheticDemoData(patients, [{ ...users[0], email: "someone@example.com" }], clinics)).toThrow();
    expect(() => assertSyntheticDemoData(patients, users, [...clinics, { id: "other-clinic" }])).toThrow();
  });
});
