import { describe, expect, it, vi } from "vitest";
import { loadIntegrationContextByRingbaPublicIngestKey } from "./integration-ingest";
import { createSha256Hex } from "./netlify-request";

function fakeClient(row: Record<string, unknown> | null) {
  const eqCalls: Array<[string, unknown]> = [];
  let fromTable = "";
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return builder;
    }),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  const client = {
    from: vi.fn((table: string) => {
      fromTable = table;
      return builder;
    }),
  };
  return { client, builder, eqCalls, getFrom: () => fromTable };
}

describe("loadIntegrationContextByRingbaPublicIngestKey", () => {
  it("looks the integration up by the hashed ingest key (no plaintext scan)", async () => {
    const row = {
      id: "int_1",
      organization_id: "org_1",
      provider: "ringba",
      display_name: "Ringba",
      config: { ringba: { publicIngestKey: "ringba_live_secret" } },
    };
    const { client, eqCalls, builder, getFrom } = fakeClient(row);

    const result = await loadIntegrationContextByRingbaPublicIngestKey(
      client as never,
      "ringba_live_secret"
    );

    expect(getFrom()).toBe("integrations");
    // Filters on provider AND the SHA-256 hash of the key — an indexed equality,
    // not an O(n) plaintext comparison.
    expect(eqCalls).toContainEqual(["provider", "ringba"]);
    expect(eqCalls).toContainEqual(["public_ingest_key_hash", createSha256Hex("ringba_live_secret")]);
    expect(builder.maybeSingle).toHaveBeenCalledTimes(1);
    expect(result?.id).toBe("int_1");
  });

  it("short-circuits an empty key without querying", async () => {
    const { client } = fakeClient(null);
    const result = await loadIntegrationContextByRingbaPublicIngestKey(client as never, "");
    expect(result).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns null when no integration matches the hash", async () => {
    const { client } = fakeClient(null);
    const result = await loadIntegrationContextByRingbaPublicIngestKey(client as never, "ringba_live_unknown");
    expect(result).toBeNull();
  });
});
