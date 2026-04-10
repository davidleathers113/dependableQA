import { describe, expect, it } from "vitest";
import {
  buildRecoveryRedirectUrl,
  normalizeRecoveryErrorMessage,
  parseRecoveryParams,
} from "./recovery";

describe("recovery helpers", () => {
  it("builds a reset-password redirect from the current origin", () => {
    expect(
      buildRecoveryRedirectUrl(new URL("https://app.example.com/forgot-password"))
    ).toBe("https://app.example.com/reset-password");
  });

  it("parses code-based recovery links from search params", () => {
    expect(
      parseRecoveryParams(
        "https://app.example.com/reset-password?code=abc123&type=recovery"
      )
    ).toMatchObject({
      code: "abc123",
      tokenHash: "",
      type: "recovery",
      hasHashTokens: false,
      hasRecoveryContext: true,
    });
  });

  it("parses token recovery links from the URL hash", () => {
    expect(
      parseRecoveryParams(
        "https://app.example.com/reset-password#access_token=access&refresh_token=refresh&type=recovery"
      )
    ).toMatchObject({
      code: "",
      tokenHash: "",
      type: "",
      hasHashTokens: true,
      hasRecoveryContext: true,
    });
  });

  it("normalizes expired recovery link errors", () => {
    expect(normalizeRecoveryErrorMessage("Token has expired")).toBe(
      "This reset link has expired. Request a new password reset email to continue."
    );
  });
});
