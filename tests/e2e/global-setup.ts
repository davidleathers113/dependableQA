import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Seeds deterministic local data before the e2e run and persists the generated
 * ids/creds to .seed.json for the specs. seed.mjs refuses any non-local DB host,
 * so this can only ever write to the local Supabase stack.
 */
export default async function globalSetup() {
  const out = execFileSync("node", [path.join(here, "seed.mjs")], { encoding: "utf8" });
  const seed = JSON.parse(out.slice(out.indexOf("{")));
  writeFileSync(path.join(here, ".seed.json"), JSON.stringify(seed, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(`[e2e] seeded org ${seed.ids.org} / call ${seed.ids.call}`);
}
