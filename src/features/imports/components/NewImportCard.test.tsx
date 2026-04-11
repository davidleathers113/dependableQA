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
    expect(html.includes("We auto-detect TrackDrive, Ringba, and Retreaver reports.")).toBe(true);
    expect(html.includes("Drop a CSV file here, or browse")).toBe(true);
    expect(html.includes("Duplicate filenames may fail if the storage path already exists.")).toBe(true);
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

    expect(html.includes("Choose one manually to continue")).toBe(true);
    expect(html.includes("Continue import")).toBe(true);
    expect(html.includes("mystery.csv")).toBe(true);
  });
});
