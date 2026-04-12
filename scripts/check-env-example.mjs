import { readFile } from "node:fs/promises";
import path from "node:path";

const requiredKeys = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "AI_DISPATCH_SHARED_SECRET",
  "INTEGRATION_INGEST_SHARED_SECRET",
  "APP_URL",
  "NETLIFY_SITE_URL",
  "DEFAULT_RECHARGE_THRESHOLD_CENTS",
  "DEFAULT_RECHARGE_AMOUNT_CENTS",
  "DEFAULT_PER_MINUTE_RATE_CENTS",
];

const envExamplePath = path.resolve(process.cwd(), ".env-example");
const text = await readFile(envExamplePath, "utf8");
const keys = new Set();

for (const rawLine of text.split("\n")) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) {
    continue;
  }

  const separatorIndex = line.indexOf("=");
  if (separatorIndex <= 0) {
    continue;
  }

  keys.add(line.slice(0, separatorIndex).trim());
}

const missing = requiredKeys.filter((key) => !keys.has(key));
if (missing.length > 0) {
  console.error(`.env-example is missing required keys: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(".env-example contains all required keys.");
