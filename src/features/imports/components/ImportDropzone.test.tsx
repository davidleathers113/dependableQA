import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportDropzone } from "./ImportDropzone";

describe("ImportDropzone", () => {
  it("renders compact upload copy and staged upload progress", () => {
    const html = renderToStaticMarkup(
      <ImportDropzone
        uploadPhase="dispatching"
        onFileSelect={() => undefined}
        disabled={true}
      />
    );

    expect(html.includes("Dispatching import...")).toBe(true);
    expect(html.includes("validating and processing your file")).toBe(true);
    expect(html.includes("Browse files")).toBe(true);
  });
});
