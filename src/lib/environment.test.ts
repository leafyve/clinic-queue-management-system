import { describe, expect, it } from "vitest";
import { isLocalDemoEnvironment, validateDeploymentEnvironment, validatePublicEnvironment } from "./environment";

const local = { environment: "LOCAL", url: "http://127.0.0.1:54321", key: "sb_publishable_test" };
const staging = { APP_ENV: "STAGING", NEXT_PUBLIC_APP_ENV: "STAGING", STAGING_SUPABASE_PROJECT_REF: "stagingfake", NEXT_PUBLIC_SUPABASE_URL: "https://stagingfake.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SECRET_KEY: "sb_secret_test", MEDICAL_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), CRON_SECRET: "x".repeat(32) };
describe("explicit environment isolation", () => {
  it("shows a demo indicator only for validated configured LOCAL state", () => {
    const env = { APP_ENV: "LOCAL", NEXT_PUBLIC_APP_ENV: "LOCAL", NEXT_PUBLIC_SUPABASE_URL: local.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.key };
    expect(isLocalDemoEnvironment(env)).toBe(true);
    for (const patch of [{ APP_ENV: "STAGING" }, { NEXT_PUBLIC_APP_ENV: "PRODUCTION" }, { NEXT_PUBLIC_SUPABASE_URL: "https://stagingfake.supabase.co" }, { NEXT_PUBLIC_LOCAL_PREVIEW: "true" }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_wrong" }]) expect(isLocalDemoEnvironment({ ...env, ...patch })).toBe(false);
    expect(isLocalDemoEnvironment(staging)).toBe(false);
    expect(isLocalDemoEnvironment({})).toBe(false);
  });
  it("requires explicit class; only explicit local preview can lack configuration", () => {
    expect(() => validatePublicEnvironment({})).toThrow();
    expect(validatePublicEnvironment({ environment: "LOCAL", preview: "true" })).toBe(false);
    for (const environment of ["STAGING", "PRODUCTION"]) expect(() => validatePublicEnvironment({ environment, preview: "true" })).toThrow();
    expect(() => validatePublicEnvironment({ environment: "LOCAL" })).toThrow();
    expect(() => validatePublicEnvironment({ ...local, key: "" })).toThrow();
    expect(() => validatePublicEnvironment({ ...local, url: "secret-like-invalid-origin" })).toThrow("Invalid Supabase origin");
  });
  it("rejects cross-environment hosts, non-HTTPS cloud, privileged public keys", () => {
    expect(validatePublicEnvironment(local)).toBe(true);
    for (const patch of [{ environment: "STAGING" }, { url: "https://stagingfake.supabase.co" }, { key: "sb_secret_wrong" }]) expect(() => validatePublicEnvironment({ ...local, ...patch })).toThrow();
    expect(() => validateDeploymentEnvironment({ ...staging, NEXT_PUBLIC_SUPABASE_URL: "http://stagingfake.supabase.co" })).toThrow();
    const serviceJWT = `x.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.x`;
    expect(() => validatePublicEnvironment({ ...local, key: serviceJWT })).toThrow();
  });
  it("rejects mismatched class/project, missing server secrets and unknown public variables", () => {
    expect(validateDeploymentEnvironment(staging)).toBe(true);
    for (const patch of [{ APP_ENV: "PRODUCTION" }, { STAGING_SUPABASE_PROJECT_REF: "anotherproject" }, { SUPABASE_SECRET_KEY: "" }, { MEDICAL_DATA_ENCRYPTION_KEY: "bad" }, { NEXT_PUBLIC_ACCESS_TOKEN: "forbidden" }]) expect(() => validateDeploymentEnvironment({ ...staging, ...patch })).toThrow();
  });
  it("requires complete provider configuration and controlled staging recipients", () => {
    expect(() => validateDeploymentEnvironment({ ...staging, WHATSAPP_ACCESS_TOKEN: "test" })).toThrow();
    const provider = { WHATSAPP_ACCESS_TOKEN: "test", WHATSAPP_PHONE_NUMBER_ID: "test" };
    expect(() => validateDeploymentEnvironment({ ...staging, ...provider })).toThrow();
    expect(validateDeploymentEnvironment({ ...staging, ...provider, STAGING_WHATSAPP_RECIPIENTS: "19995550001" })).toBe(true);
  });
});
