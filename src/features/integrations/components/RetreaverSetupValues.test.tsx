import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RetreaverSetupValues } from "./RetreaverSetupValues";

describe("RetreaverSetupValues", () => {
  it("renders copyable concrete values when the integration is configured", () => {
    const html = renderToStaticMarkup(
      <RetreaverSetupValues
        endpoint="https://app.example.com/.netlify/functions/integration-ingest"
        integrationId="int_abc123"
        headerName="x-retreaver-signature"
        secretConfigured
      />
    );

    expect(html).toContain("Values to copy");
    expect(html).toContain("https://app.example.com/.netlify/functions/integration-ingest");
    expect(html).toContain("int_abc123");
    expect(html).toContain("x-retreaver-signature");
    // Copy affordances are present (CopyField buttons).
    expect(html).toContain("Copy URL");
    expect(html).toContain("Copy ID");
    expect(html).toContain("Copy header");
    expect(html).toContain("A signing secret is configured");
  });

  it("explains where to find the integration id before it exists", () => {
    const html = renderToStaticMarkup(
      <RetreaverSetupValues
        endpoint="https://app.example.com/hook"
        integrationId=""
        headerName="x-dependableqa-signature"
        secretConfigured={false}
      />
    );

    expect(html).toContain("Create the integration first");
    expect(html).toContain("No signing secret is configured yet");
    // The empty id leaves the Copy ID button disabled (CopyField disables on empty value).
    expect(html).toContain("disabled");
  });

  it("never renders a signing secret value (only configured/not-configured state)", () => {
    const html = renderToStaticMarkup(
      <RetreaverSetupValues
        endpoint="https://app.example.com/hook"
        integrationId="int_1"
        headerName="x-dependableqa-signature"
        secretConfigured
      />
    );
    // No secret prop exists, so there is nothing to leak; assert the status copy, not a value.
    expect(html).toContain("Manage or rotate it on this integration");
    expect(html).not.toContain("secretValue");
  });
});
