/** @param {{API_URL: string, DB_URL: string}} status @param {Record<string, string | undefined>} env */
export function assertLocalDemoTarget(status, env = process.env) {
  for (const name of ["APP_ENV", "NEXT_PUBLIC_APP_ENV"]) {
    if (env[name] && env[name] !== "LOCAL") throw new Error("Demo reset requires LOCAL environment");
  }
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]) {
    if (env[name] && env[name] !== "http://127.0.0.1:54321") throw new Error("Demo reset refuses a hosted or unexpected Supabase URL");
  }
  if (env.DATABASE_URL && env.DATABASE_URL !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres") throw new Error("Demo reset refuses a nonlocal database");
  if (status.API_URL !== "http://127.0.0.1:54321" || status.DB_URL !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres") {
    throw new Error("Demo reset requires this repository's exact loopback Supabase stack");
  }
}

export function assertSyntheticDemoData(patients, users, clinics) {
  if (patients.some(row => !/^(LOCAL TEST|DEMO —) /.test(row.full_name))) throw new Error("Demo reset refuses nonfixture patients");
  if (users.some(row => !/^(LOCAL TEST|DEMO —) /.test(row.full_name) || !row.email?.endsWith("@example.invalid"))) throw new Error("Demo reset refuses nonfixture accounts");
  if (clinics.some(row => row.id !== "10000000-0000-4000-8000-000000000001")) throw new Error("Demo reset refuses additional clinics");
}
