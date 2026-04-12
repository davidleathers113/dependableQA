import { readdir } from "node:fs/promises";
import path from "node:path";

const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
const migrationFiles = (await readdir(migrationsDir))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();

if (migrationFiles.length === 0) {
  console.error("No migration files were found in supabase/migrations.");
  process.exit(1);
}

const numericPrefixes = [];
for (const fileName of migrationFiles) {
  const underscoreIndex = fileName.indexOf("_");
  if (underscoreIndex <= 0) {
    console.error(`Migration file does not use the expected prefix format: ${fileName}`);
    process.exit(1);
  }

  const prefixText = fileName.slice(0, underscoreIndex);
  const prefixValue = Number(prefixText);
  if (!Number.isInteger(prefixValue)) {
    console.error(`Migration file prefix must be numeric: ${fileName}`);
    process.exit(1);
  }

  numericPrefixes.push(prefixValue);
}

for (let index = 1; index < numericPrefixes.length; index += 1) {
  const previous = numericPrefixes[index - 1];
  const current = numericPrefixes[index];
  if (current !== previous + 1) {
    console.error(
      `Migration numbering must be contiguous. Expected ${String(previous + 1).padStart(4, "0")} before ${migrationFiles[index]}.`
    );
    process.exit(1);
  }
}

console.log(`Migration ordering looks valid (${migrationFiles.length} files).`);
