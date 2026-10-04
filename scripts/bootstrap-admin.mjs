import { createClient } from "@supabase/supabase-js";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_FULL_NAME"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
if (process.env.BOOTSTRAP_ADMIN_CONFIRM !== "jo-lin") throw new Error("Set BOOTSTRAP_ADMIN_CONFIRM=jo-lin to confirm this privileged bootstrap action");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: clinic, error: clinicError } = await admin.from("clinics").select("id").eq("slug", "jo-lin-family-clinic").single();
if (clinicError) throw clinicError;

const { data: created, error: createError } = await admin.auth.admin.createUser({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, email_confirm: true, user_metadata: { full_name: process.env.ADMIN_FULL_NAME } });
if (createError) throw createError;

const { error: profileError } = await admin.from("users").upsert({ id: created.user.id, role: "admin", full_name: process.env.ADMIN_FULL_NAME, email: process.env.ADMIN_EMAIL, is_active: true });
if (profileError) throw profileError;
const { error: staffError } = await admin.from("staff").insert({ user_id: created.user.id, clinic_id: clinic.id, role: "admin" });
if (staffError) throw staffError;

console.log(`Admin account created for ${process.env.ADMIN_EMAIL}. Remove ADMIN_PASSWORD from the shell history and environment now.`);
