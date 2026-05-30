import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell";

const session = {
  user: { id: "u1", email: "owner@example.test" },
  organization: { id: "o1", name: "Acme", role: "owner" },
};

function render(currentPath: string) {
  return renderToStaticMarkup(
    <AppShell title="Calls" session={session} currentPath={currentPath}>
      <div>child</div>
    </AppShell>
  );
}

/** Returns the opening-tag chunk for the anchor with the given href. */
function anchorFor(html: string, href: string): string {
  const chunk = html.split("<a ").find((part) => part.includes(`href="${href}"`));
  return chunk ?? "";
}

const ACTIVE = "bg-violet-600/20 text-violet-400";
const INACTIVE = "text-slate-400";

describe("AppShell active nav", () => {
  // Regression: the active-nav class must be derived from the currentPath prop
  // (server-known), not window.location — otherwise SSR renders no active link
  // and the client renders one, causing a hydration mismatch.
  it("marks the nav item for the current path active during server render", () => {
    const html = render("/app/calls");
    expect(anchorFor(html, "/app/calls")).toContain(ACTIVE);
    expect(anchorFor(html, "/app/overview")).toContain(INACTIVE);
    expect(anchorFor(html, "/app/overview")).not.toContain(ACTIVE);
  });

  it("renders deterministically without window (active follows the prop)", () => {
    const html = render("/app/overview");
    expect(anchorFor(html, "/app/overview")).toContain(ACTIVE);
    expect(anchorFor(html, "/app/calls")).not.toContain(ACTIVE);
  });
});
