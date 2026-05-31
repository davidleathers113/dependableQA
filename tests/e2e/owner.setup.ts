import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as setup } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(here, ".seed.json"), "utf8"));
const authFile = path.join(here, ".auth", "owner.json");

// Owner session for the integrations specs (integration management requires
// owner/admin). Mirrors auth.setup.ts; the same prod-safety gate applies — this
// owner exists only in the local stack, so a successful login proves the app is
// wired to local Supabase.
setup("authenticate as the seeded owner", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByRole("textbox", { name: "Email" });
  const password = page.getByRole("textbox", { name: "Password" });
  const submit = page.getByRole("button", { name: "Log in" });

  await expect(async () => {
    await email.click();
    await email.fill("");
    await email.pressSequentially(seed.owner.email, { delay: 15 });
    await password.click();
    await password.fill("");
    await password.pressSequentially(seed.owner.password, { delay: 15 });
    await expect(submit).toBeEnabled();
  }).toPass({ timeout: 20_000, intervals: [400, 800, 1500] });

  await Promise.all([page.waitForURL("**/app/**", { timeout: 15_000 }), submit.click()]);
  expect(page.url()).toContain("/app");

  await page.context().storageState({ path: authFile });
});
