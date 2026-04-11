import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportDropzone } from "./ImportDropzone";

describe("ImportDropzone", () => {
  it("renders drag-over copy and staged upload progress", () => {
    const html = renderToStaticMarkup(
      <ImportDropzone
        isDragging={true}
        isUploading={true}
        uploadPhaseLabel="Dispatching import..."
        onFileSelect={() => undefined}
        onDragEnter={() => undefined}
        onDragOver={() => undefined}
        onDragLeave={() => undefined}
        onDrop={() => undefined}
        providerSelector={<div>Provider selector</div>}
        providerHelp={<div>Provider help</div>}
        error={null}
        warning={<div>Duplicate warning</div>}
        success={null}
      />
    );

    expect(html.includes("Drop CSV to upload")).toBe(true);
    expect(html.includes("Dispatching import...")).toBe(true);
    expect(html.includes("Duplicate filenames may fail")).toBe(true);
    expect(html.includes("Duplicate warning")).toBe(true);
  });
});
