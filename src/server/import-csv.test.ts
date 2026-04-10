import { describe, expect, it } from "vitest";
import {
  getImportBatchFinalStatus,
  normalizeCsvHeader,
  parseCsv,
  parseCsvLine,
} from "./import-csv";

describe("import csv helpers", () => {
  it("normalizes csv headers", () => {
    expect(normalizeCsvHeader("Caller Number")).toBe("caller_number");
    expect(normalizeCsvHeader("started-at")).toBe("started_at");
  });

  it("parses quoted csv lines", () => {
    expect(parseCsvLine('"Doe, Jane",Qualified,120')).toEqual([
      "Doe, Jane",
      "Qualified",
      "120",
    ]);
  });

  it("parses csv rows with CRLF and quoted values", () => {
    const rows = parseCsv(
      'Caller Number,Started At,Transcript\r\n"+15550001111",2026-04-10T15:00:00Z,"Hello, world"\r\n'
    );

    expect(rows).toEqual([
      {
        caller_number: "+15550001111",
        started_at: "2026-04-10T15:00:00Z",
        transcript: "Hello, world",
      },
    ]);
  });

  it("returns the expected final batch status", () => {
    expect(getImportBatchFinalStatus(2, 0)).toBe("completed");
    expect(getImportBatchFinalStatus(2, 1)).toBe("partial");
    expect(getImportBatchFinalStatus(0, 3)).toBe("failed");
  });
});
