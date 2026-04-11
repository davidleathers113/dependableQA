import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportProviderHelp } from "./ImportProviderHelp";

describe("ImportProviderHelp", () => {
  it("renders template and sample download links for custom imports", () => {
    const html = renderToStaticMarkup(<ImportProviderHelp provider="custom" />);

    expect(html.includes("Download template CSV")).toBe(true);
    expect(html.includes("/imports/custom-template.csv")).toBe(true);
    expect(html.includes("Download sample CSV")).toBe(true);
  });
});
