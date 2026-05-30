import { describe, expect, it, vi } from "vitest";

const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({ __isBrowserClient: true })),
}));

// The browser client MUST come from @supabase/ssr (cookie-backed session shared
// with the server client). A plain @supabase/supabase-js createClient would use
// localStorage and never see the session cookie, so every client-side query
// would run unauthenticated (RLS-denied / 406).
vi.mock("@supabase/ssr", () => ({ createBrowserClient }));
vi.mock("astro:env/client", () => ({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_DATABASE_URL: "",
  SUPABASE_ANON_KEY: "local-anon-key",
}));

import { getBrowserSupabase } from "./browser-client";

describe("getBrowserSupabase", () => {
  it("constructs the client via @supabase/ssr createBrowserClient with the public config", () => {
    const client = getBrowserSupabase();
    expect(createBrowserClient).toHaveBeenCalledWith("http://127.0.0.1:54321", "local-anon-key");
    expect(client).toEqual({ __isBrowserClient: true });
  });
});
