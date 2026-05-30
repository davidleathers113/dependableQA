import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as setup } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(here, ".seed.json"), "utf8"));
const authFile = path.join(here, ".auth", "reviewer.json");

setup("authenticate as the seeded reviewer", async ({ page }) => {
  // Prod-safety gate: this reviewer exists ONLY in the local stack. A successful
  // login proves the app is wired to local Supabase. If it were pointed at
  // production, this would fail and no workflow spec would run — so e2e can
  // never mutate production data.
  await page.goto("/login");
  const email = page.getByRole("textbox", { name: "Email" });
  const password = page.getByRole("textbox", { name: "Password" });
  const submit = page.getByRole("button", { name: "Log in" });

  // The login form is a hydrated React island with controlled inputs. Type with
  // real keystrokes (pressSequentially) so each char fires React's onChange and
  // the controlled state actually commits — plain fill() can set the DOM value
  // before/around hydration without updating state, yielding an empty submit.
  // Retry until the submit button enables, which only happens once React has
  // committed valid state (its validity effect ran).
  await expect(async () => {
    await email.click();
    await email.fill("");
    await email.pressSequentially(seed.login.email, { delay: 15 });
    await password.click();
    await password.fill("");
    await password.pressSequentially(seed.login.password, { delay: 15 });
    await expect(submit).toBeEnabled();
  }).toPass({ timeout: 20_000, intervals: [400, 800, 1500] });

  await Promise.all([page.waitForURL("**/app/**", { timeout: 15_000 }), submit.click()]);
  expect(page.url()).toContain("/app");

  await page.context().storageState({ path: authFile });
});
