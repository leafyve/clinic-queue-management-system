import { validateDeploymentEnvironment } from "../src/lib/environment.ts";

export function stagingConfig() {
  validateDeploymentEnvironment(process.env);
  if (process.env.APP_ENV !== "STAGING") throw new Error("This command requires STAGING");
  let app;
  try { app = new URL(process.env.STAGING_APP_URL ?? ""); } catch { throw new Error("Explicit staging application origin required"); }
  if (app.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(app.hostname) || app.username || app.password || app.search || app.hash || app.pathname !== "/") throw new Error("Explicit HTTPS staging application origin required");
  if (process.env.STAGING_VERIFICATION_CONFIRM !== process.env.STAGING_SUPABASE_PROJECT_REF) throw new Error("Confirm the dedicated staging project reference before verification");
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret: process.env.SUPABASE_SECRET_KEY, ref: process.env.STAGING_SUPABASE_PROJECT_REF, app: app.origin };
}
