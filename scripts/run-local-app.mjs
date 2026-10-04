import { spawn } from "node:child_process";

const mode=process.argv[2];
if (!["dev","start"].includes(mode) || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321" || process.env.LOCAL_TEST_APP_URL !== "http://127.0.0.1:3100") {
  throw new Error("Local verification launcher refused non-loopback configuration");
}
// Explicit empty values prevent Next's automatic dotenv loading from bringing
// provider credentials into the local acceptance app. Never call Meta in tests.
const child=spawn(process.execPath,["node_modules/next/dist/bin/next",mode,"--port","3100","--hostname","127.0.0.1"],{
  stdio:"inherit",env:{ ...process.env,APP_ENV:"LOCAL",NEXT_PUBLIC_APP_ENV:"LOCAL",NEXT_PUBLIC_LOCAL_PREVIEW:"false",WHATSAPP_ACCESS_TOKEN:"",WHATSAPP_PHONE_NUMBER_ID:"" },
});
for (const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>child.kill(signal));
child.on("exit",code=>process.exit(code ?? 1));
