import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Locator, type Page, expect, test as base } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(here, ".seed.json"), "utf8"));
const callId: string = seed.ids.call;
const flagId: string = seed.ids.flag;

// The production Supabase project ref. e2e must NEVER contact it.
const PROD_HOST = "gqvwuranduktvoqpuywq";
const SEEDED_NOTE = "Follow up on the pricing request.";

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

// The call-detail right rail (flags/notes) and the search controls are rendered
// twice for responsive layout (one copy hidden via CSS), so locators resolve to
// two elements. Scope to the visible copy.
const vis = (locator: Locator) => locator.filter({ visible: true });

/**
 * Type into a hydrated React (controlled) input with real keystrokes so the
 * island's onChange commits state — plain fill() can set only the DOM value
 * around hydration, leaving React state empty. Retries until the value sticks.
 */
async function typeStable(input: Locator, value: string) {
  await expect(async () => {
    await input.click();
    await input.fill("");
    await input.pressSequentially(value, { delay: 15 });
    await expect(input).toHaveValue(value);
  }).toPass({ timeout: 15_000, intervals: [300, 700, 1200] });
}

test.describe("reviewer workflow", () => {
  test("call list shows the seeded call", async ({ page }) => {
    await page.goto("/app/calls");
    await expect(page.getByText("+15555551234")).toBeVisible();
    await expect(page.getByText("Missing disclosure")).toBeVisible();
  });

  test("call detail renders transcript, flag, note, and the no-recording fallback", async ({ page }) => {
    await page.goto(`/app/calls/${callId}`);
    await expect(page.getByRole("heading", { name: "+15555551234" })).toBeVisible();
    await expect(page.getByText("No recording loaded", { exact: false })).toBeVisible();
    await expect(
      page.getByText("I want pricing details for the enterprise plan.", { exact: true })
    ).toBeVisible();
    await expect(vis(page.getByText("Missing disclosure", { exact: true }))).toBeVisible();
    await expect(vis(page.getByText(SEEDED_NOTE, { exact: true }))).toBeVisible();
  });

  test("transcript search finds matches", async ({ page }) => {
    await page.goto(`/app/calls/${callId}`);
    await typeStable(vis(page.getByRole("textbox", { name: "Search transcript", exact: false })), "pricing");
    await expect(vis(page.getByRole("button", { name: "Next hit" }))).toBeEnabled();
    await expect(vis(page.locator("mark")).first()).toBeVisible();
  });

  test("deep links load the call detail (?t= and ?flag=)", async ({ page }) => {
    await page.goto(`/app/calls/${callId}?t=6`);
    await expect(page.getByRole("heading", { name: "+15555551234" })).toBeVisible();
    await page.goto(`/app/calls/${callId}?flag=${flagId}`);
    await expect(page.getByRole("heading", { name: "+15555551234" })).toBeVisible();
  });

  test("pressing '/' focuses the transcript search", async ({ page }) => {
    await page.goto(`/app/calls/${callId}`);
    await expect(vis(page.getByRole("textbox", { name: "Search transcript", exact: false }))).toBeVisible();
    // The shortcut focuses whichever responsive copy is active; assert the
    // focused element is a transcript-search box. Retry to absorb the keydown
    // listener attaching at hydration.
    await expect(async () => {
      await page.locator("body").click();
      await page.keyboard.press("/");
      const placeholder = await page.evaluate(
        () => document.activeElement?.getAttribute("placeholder") ?? ""
      );
      expect(placeholder).toContain("Search transcript");
    }).toPass({ timeout: 8_000, intervals: [300, 700] });
  });

  // --- mutations (run after the read-only checks) ----------------------------

  test("resolving the open flag clears the open count", async ({ page }) => {
    await page.goto(`/app/calls/${callId}`);
    const openBadge = vis(page.getByText("1 open", { exact: true }));
    await expect(openBadge).toBeVisible();
    // Click Resolve until the open count clears. The retry absorbs a click that
    // lands before the island hydrates (a no-op); it's idempotent because once
    // the flag is resolved the Resolve button is gone, so we stop clicking.
    await expect(async () => {
      const resolve = vis(page.getByRole("button", { name: "Resolve" }));
      if (await resolve.count()) await resolve.first().click();
      await expect(openBadge).toHaveCount(0);
    }).toPass({ timeout: 20_000, intervals: [600, 1200, 2500] });
  });

  test("adding a note shows it in the notes list", async ({ page }) => {
    await page.goto(`/app/calls/${callId}`);
    await typeStable(
      vis(page.getByRole("textbox", { name: "Note at current playhead", exact: false })),
      "E2E added note"
    );
    const save = vis(page.getByRole("button", { name: "Save note", exact: true }));
    await expect(save).toBeEnabled();
    await save.click();
    await expect(vis(page.getByText("E2E added note", { exact: true }))).toBeVisible();
  });

  test("deleting the seeded note removes it", async ({ page }) => {
    await page.goto(`/app/calls/${callId}`);
    await expect(vis(page.getByText(SEEDED_NOTE, { exact: true }))).toBeVisible();
    // Click the seeded note's Delete (its card is the nearest ancestor with a
    // Delete button) until the note is gone. Retry absorbs a pre-hydration
    // no-op click; idempotent because once deleted there's nothing left to click.
    await expect(async () => {
      const note = vis(page.getByText(SEEDED_NOTE, { exact: true }));
      if (await note.count()) {
        await note
          .first()
          .locator("xpath=ancestor::*[.//button[normalize-space(.)='Delete']][1]")
          .getByRole("button", { name: "Delete" })
          .click();
      }
      await expect(vis(page.getByText(SEEDED_NOTE, { exact: true }))).toHaveCount(0);
    }).toPass({ timeout: 20_000, intervals: [600, 1200, 2500] });
  });
});
