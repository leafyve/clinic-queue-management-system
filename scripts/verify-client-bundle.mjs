import { readdirSync,readFileSync } from "node:fs";
import { join } from "node:path";

const root=".next/static";
const required=["SUPABASE_SECRET_KEY","MEDICAL_DATA_ENCRYPTION_KEY","CRON_SECRET"];
for (const name of required) if (!process.env[name]) throw new Error(`Supply ${name} to verify its absence, without printing it`);
const names=[...required,"WHATSAPP_ACCESS_TOKEN","WHATSAPP_WEBHOOK_VERIFY_TOKEN","SUPABASE_DB_PASSWORD","DATABASE_URL"].filter(name=>process.env[name]);
const files=readdirSync(root,{recursive:true}).filter(file=>/\.(js|css|map)$/.test(file));
if (!files.length) throw new Error("Build client bundles first");
for (const file of files) {
  const content=readFileSync(join(root,file),"utf8");
  for (const name of names) if (content.includes(process.env[name])) throw new Error(`Server-only secret found in client bundle: ${name}`);
}
console.log(`Verified ${files.length} client assets: no supplied values for ${names.length} server secrets. Unset provider secrets cannot be value-scanned.`);
