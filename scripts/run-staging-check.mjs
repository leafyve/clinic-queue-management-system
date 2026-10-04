import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { stagingConfig } from "./staging-config.mjs";

if (!existsSync(".env.staging.local")) throw new Error("BLOCKED — CREDENTIAL REQUIRED: supply dedicated staging configuration in ignored .env.staging.local");
process.loadEnvFile(".env.staging.local");
const config = stagingConfig();
const path = ".staging-verification/identities.json";
if (!existsSync(path)) throw new Error("Bootstrap synthetic staging identities first");
const manifest = JSON.parse(readFileSync(path, "utf8"));
if (!manifest.complete || manifest.projectRef !== config.ref || manifest.appUrl !== config.app) throw new Error("Staging identity manifest does not match the target");
// Child receives only explicit staging data selection. Local integration suite
// remains local-only; never repoint its destructive cleanup to a hosted project.
const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/test/hosted-staging.test.ts"], { stdio: "inherit", env: { ...process.env, LOCAL_TEST_APP_URL: "", RUN_HOSTED_STAGING: "true" } });
child.on("exit", code => process.exit(code ?? 1));
