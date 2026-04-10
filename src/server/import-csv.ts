export interface CsvRow {
  [key: string]: string;
}

export function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().split(" ").join("_").split("-").join("_");
}

export function parseCsvLine(text: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    const next = index + 1 < text.length ? text[index + 1] : "";

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 2;
        continue;
      }

      inQuotes = !inQuotes;
      index += 1;
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  cells.push(current);
  return cells;
}

export function parseCsv(text: string) {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    const next = index + 1 < text.length ? text[index + 1] : "";

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 2;
        continue;
      }

      inQuotes = !inQuotes;
      current += character;
      index += 1;
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (current.trim()) {
        rows.push(current);
      }
      current = "";

      if (character === "\r" && next === "\n") {
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    current += character;
    index += 1;
  }

  if (current.trim()) {
    rows.push(current);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = parseCsvLine(rows[0]).map((header) => normalizeCsvHeader(header));
  const records: CsvRow[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cells = parseCsvLine(rows[rowIndex]);
    const record: CsvRow = {};

    for (let headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
      record[headers[headerIndex]] = cells[headerIndex]?.trim() ?? "";
    }

    records.push(record);
  }

  return records;
}

export function getImportBatchFinalStatus(acceptedCount: number, rejectedCount: number) {
  if (rejectedCount === 0) {
    return "completed";
  }

  return acceptedCount > 0 ? "partial" : "failed";
}
