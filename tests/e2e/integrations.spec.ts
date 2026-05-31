import { type Page, expect, test as base } from "@playwright/test";

// The production Supabase project ref. e2e must NEVER contact it.
const PROD_HOST = "gqvwuranduktvoqpuywq";

// Wrap `page` so every test fails if any request targets production.
const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const prodHits: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(PROD_HOST)) prodHits.push(req.url());
    });
    await use(page);
    expect(prodHits, "e2e must never contact the production Supabase host").toEqual([]);
  },
});

// Open the Ringba "API" tab. Retries to absorb a pre-hydration no-op click (the
// island's tab onClick isn't wired until hydration), confirming the API
// connection panel rendered before returning.
async function openApiTab(page: Page) {
  await expect(async () => {
    await page.getByRole("tab", { name: "API" }).click();
    await expect(page.getByRole("heading", { name: "API connection" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000, intervals: [300, 700, 1200] });
}

test.describe("ringba integration first-run (owner)", () => {
  test("owner can open the Ringba API connection tab", async ({ page }) => {
    await page.goto("/app/integrations");
    // The Ringba catalog placeholder is auto-selected (first in the catalog).
    // Target the detail-workspace heading (h2); the summary card repeats the
    // name as an h3.
    await expect(page.getByRole("heading", { name: "Ringba Primary", level: 2 })).toBeVisible();
    await openApiTab(page);
    await expect(page.getByRole("heading", { name: "API connection" })).toBeVisible();
  });

  test("create affordance creates the integration and unlocks the connection form", async ({ page }) => {
    await page.goto("/app/integrations");
    // openApiTab succeeds only once the island has hydrated (its tab onClick is
    // wired), so the subsequent single Create click is guaranteed to register —
    // important because create-integration is NOT idempotent (re-clicking would
    // insert duplicate rows).
    await openApiTab(page);

    const accountId = page.getByRole("textbox", { name: "Ringba Account ID", exact: false });
    const createBtn = page.getByRole("button", { name: "Create Ringba integration" });

    // First-run: the form is locked until the integration row exists.
    await expect(createBtn).toBeEnabled();
    await expect(accountId).toBeDisabled();

    await createBtn.click();

    // Creating swaps the placeholder id for the real row id, which resets the
    // workspace to Overview. Wait for that settled post-create state before
    // navigating, so the id is stable and the API tab won't bounce back.
    await expect(page.getByText("Ringba Primary created.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add credentials" })).toBeVisible();

    // The connection fields are now editable.
    await openApiTab(page);
    await expect(accountId).toBeEnabled();
    await accountId.fill("RA-e2e-test");
    await expect(accountId).toHaveValue("RA-e2e-test");
  });
});
