import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALL_FILTERS,
  buildCallFilters,
  filtersToSearchParams,
  normalizeCallFilters,
} from "./app-data";

describe("calls filter helpers", () => {
  it("normalizes incomplete filters with stable defaults", () => {
    expect(
      normalizeCallFilters({
        search: "  compliance  ",
        flaggedOnly: true,
      })
    ).toEqual({
      ...DEFAULT_CALL_FILTERS,
      search: "compliance",
      flaggedOnly: true,
    });
  });

  it("builds filters from URL state including flag and sort options", () => {
    const params = new URLSearchParams({
      search: "ivr",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-10",
      flaggedOnly: "true",
      flagCategory: "compliance",
      sortBy: "flagCount",
      sortDirection: "asc",
    });

    expect(buildCallFilters(params)).toEqual({
      ...DEFAULT_CALL_FILTERS,
      search: "ivr",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-10",
      flaggedOnly: true,
      flagCategory: "compliance",
      sortBy: "flagCount",
      sortDirection: "asc",
    });
  });

  it("serializes non-default filters into shareable URL params", () => {
    const params = filtersToSearchParams({
      ...DEFAULT_CALL_FILTERS,
      search: "sale",
      flaggedOnly: true,
      sortBy: "updatedAt",
      sortDirection: "asc",
    });

    expect(params.get("search")).toBe("sale");
    expect(params.get("flaggedOnly")).toBe("true");
    expect(params.get("sortBy")).toBe("updatedAt");
    expect(params.get("sortDirection")).toBe("asc");
    expect(params.get("dateFrom")).toBeNull();
  });
});
