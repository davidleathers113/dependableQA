import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NewImportCard } from "./NewImportCard";

describe("NewImportCard", () => {
  it("renders the compact import launcher in auto mode", () => {
    const html = renderToStaticMarkup(
      <NewImportCard
        mode="auto"
        selectedProvider="custom"
        uploadPhase="idle"
        errorState={null}
        successMessage=""
        duplicateWarning=""
        pendingFileName=""
        onModeChange={() => undefined}
        onProviderChange={() => undefined}
        onFileSelected={() => undefined}
        onContinuePendingFile={() => undefined}
      />
    );

    expect(html.includes("Import calls")).toBe(true);
    expect(html.includes("Auto-detect is on for Ringba, TrackDrive, and Retreaver.")).toBe(true);
    expect(html.includes("Drop a CSV file here, or browse")).toBe(true);
    expect(html.includes("Field guide")).toBe(true);
    expect(html.includes("Custom format")).toBe(false);
  });

  it("renders manual recovery controls when auto-detect is not confident", () => {
    const html = renderToStaticMarkup(
      <NewImportCard
        mode="manual"
        selectedProvider="ringba"
        uploadPhase="idle"
        errorState={null}
        successMessage=""
        duplicateWarning=""
        pendingFileName="mystery.csv"
        onModeChange={() => undefined}
        onProviderChange={() => undefined}
        onFileSelected={() => undefined}
        onContinuePendingFile={() => undefined}
      />
    );

    expect(html.includes("Choose the provider and continue")).toBe(true);
    expect(html.includes("Continue with selected provider")).toBe(true);
    expect(html.includes("Selected file: mystery.csv")).toBe(true);
    expect(html.includes("Ringba format")).toBe(true);
  });
});
