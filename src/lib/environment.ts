type PublicEnvironment = { environment?: string; url?: string; key?: string; preview?: string };

// Presentation only. This result never participates in access control.
export function isLocalDemoEnvironment(env: Record<string, string | undefined>) {
  try {
    return env.APP_ENV === "LOCAL" && env.NEXT_PUBLIC_APP_ENV === "LOCAL" && env.NEXT_PUBLIC_LOCAL_PREVIEW !== "true" && validateDeploymentEnvironment(env);
  } catch { return false; }
}

export function validatePublicEnvironment(input: PublicEnvironment) {
  if (!["LOCAL", "STAGING", "PRODUCTION"].includes(input.environment ?? "")) {
    throw new Error("NEXT_PUBLIC_APP_ENV must explicitly be LOCAL, STAGING or PRODUCTION");
  }
  const local = input.environment === "LOCAL";
  if (input.preview && !["true", "false"].includes(input.preview)) throw new Error("Invalid local preview setting");
  if (!local && input.preview === "true") throw new Error("Preview is restricted to LOCAL");
  if (!input.url && !input.key && local && input.preview === "true") return false;
  if (!input.url || !input.key) throw new Error("Supabase public configuration is incomplete");
  let url: URL;
  try { url = new URL(input.url); } catch { throw new Error("Invalid Supabase origin"); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Supabase URL must be an origin");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (local ? !loopback || !["http:", "https:"].includes(url.protocol) : loopback || url.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
    throw new Error("Supabase URL does not match the selected environment");
  }
  if (input.key.startsWith("sb_secret_")) throw new Error("Privileged key forbidden in public configuration");
  if (!input.key.startsWith("sb_publishable_")) {
    try {
      const claims = JSON.parse(atob(input.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (claims.role !== "anon") throw new Error();
    } catch { throw new Error("Expected a publishable or legacy anon key"); }
  }
  return true;
}

export function validateDeploymentEnvironment(env: Record<string, string | undefined>) {
  const allowedPublic = ["NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_LOCAL_PREVIEW", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (Object.keys(env).some(name => name.startsWith("NEXT_PUBLIC_") && !allowedPublic.includes(name))) throw new Error("Unexpected public environment variable");
  if (env.APP_ENV !== env.NEXT_PUBLIC_APP_ENV) throw new Error("APP_ENV and NEXT_PUBLIC_APP_ENV must match");
  const configured = validatePublicEnvironment({ environment: env.NEXT_PUBLIC_APP_ENV, url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, preview: env.NEXT_PUBLIC_LOCAL_PREVIEW });
  if (env.APP_ENV !== "LOCAL") {
    const ref = env.APP_ENV === "STAGING" ? env.STAGING_SUPABASE_PROJECT_REF : env.PRODUCTION_SUPABASE_PROJECT_REF;
    if (!ref || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) throw new Error("Explicit project reference does not match this environment");
    for (const name of ["SUPABASE_SECRET_KEY", "MEDICAL_DATA_ENCRYPTION_KEY", "CRON_SECRET"]) if (!env[name]) throw new Error(`Missing server configuration: ${name}`);
    if (!/^[A-Za-z0-9+/]{43}=$/.test(env.MEDICAL_DATA_ENCRYPTION_KEY!)) throw new Error("Encryption key must encode 32 random bytes");
    if (env.CRON_SECRET!.length < 32) throw new Error("Worker secret must contain at least 32 characters");
    const hasProvider = Boolean(env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_PHONE_NUMBER_ID);
    if (hasProvider && (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID)) throw new Error("Incomplete WhatsApp configuration");
    if (env.APP_ENV === "STAGING" && hasProvider && !/^\d{8,15}(,\d{8,15})*$/.test(env.STAGING_WHATSAPP_RECIPIENTS ?? "")) throw new Error("Staging WhatsApp requires an explicit controlled recipient allowlist");
  }
  return configured;
}
