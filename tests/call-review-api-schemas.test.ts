import { describe, expect, it } from "vitest";
import { validateFlagTimes, validateNoteTimes } from "../src/lib/call-review-api-schemas";

describe("call-review-api-schemas", () => {
  it("rejects end before start for flags", () => {
    expect(validateFlagTimes(5, 2)).toBe("endSeconds must be greater than or equal to startSeconds.");
  });

  it("accepts equal start and end for flags", () => {
    expect(validateFlagTimes(3, 3)).toBeNull();
  });

  it("accepts missing end for flags", () => {
    expect(validateFlagTimes(1, undefined)).toBeNull();
  });

  it("rejects end before start for notes", () => {
    expect(validateNoteTimes(10, 5)).toBe("endSeconds must be greater than or equal to startSeconds.");
  });
});
