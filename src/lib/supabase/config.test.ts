import { describe, expect, it } from "vitest";
import {
  requireAdminSupabaseConfig,
  requirePublicSupabaseConfig,
  resolvePublicSupabaseConfig,
} from "./config";

describe("supabase config helpers", () => {
  it("resolves public config with fallback url", () => {
    expect(
      resolvePublicSupabaseConfig({
        url: "",
        fallbackUrl: "https://fallback.supabase.co",
        anonKey: "anon-key",
      })
    ).toEqual({
      url: "https://fallback.supabase.co",
      anonKey: "anon-key",
    });
  });

  it("throws when public config is incomplete", () => {
    expect(() =>
      requirePublicSupabaseConfig({
        url: "",
        fallbackUrl: "",
        anonKey: "",
      })
    ).toThrow("Missing Supabase client configuration");
  });

  it("throws when admin config is incomplete", () => {
    expect(() =>
      requireAdminSupabaseConfig({
        url: "https://example.supabase.co",
        fallbackUrl: "",
        serviceRoleKey: "",
      })
    ).toThrow("Missing Supabase admin configuration");
  });
});
