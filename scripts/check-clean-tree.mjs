import { execFileSync } from "node:child_process";

/**
 * Release gate (QA report Blocker 2): a release must certify a specific
 * committed artifact, not a dirty working tree. Fails when `git status
 * --porcelain` reports anything tracked-but-modified or untracked, so a deploy
 * can't be cut from uncommitted changes. Run via `npm run release:verify`
 * (which also runs the full ci:verify gate) before producing a deploy.
 *
 * Intentionally NOT part of `ci:verify`: developers run that against a dirty
 * tree all day. In GitHub Actions the tree is clean (a fresh checkout), so this
 * is a local/manual release step.
 */
let status;
try {
  status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
} catch (error) {
  console.error(`Unable to run git status: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const dirtyLines = status.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

if (dirtyLines.length > 0) {
  console.error("Working tree is not clean — commit, stash, or remove these before releasing:");
  for (const line of dirtyLines) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}

console.log("Working tree is clean.");
