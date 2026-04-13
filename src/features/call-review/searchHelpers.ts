/**
 * Substring search without RegExp (project security rule).
 */
export function findAllMatchPositions(haystack: string, needle: string): Array<{ start: number; end: number }> {
  if (needle.length === 0) {
    return [];
  }

  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const out: Array<{ start: number; end: number }> = [];
  let from = 0;

  while (from < lowerHay.length) {
    const idx = lowerHay.indexOf(lowerNeedle, from);
    if (idx === -1) {
      break;
    }
    out.push({ start: idx, end: idx + needle.length });
    from = idx + Math.max(1, needle.length);
  }

  return out;
}

export function splitTextByRanges(
  text: string,
  ranges: Array<{ start: number; end: number }>
): Array<{ type: "plain" | "hit"; text: string }> {
  if (ranges.length === 0) {
    return [{ type: "plain", text }];
  }

  const sorted = ranges
    .slice()
    .filter((r) => r.start >= 0 && r.end <= text.length && r.start < r.end)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (!last || r.start > last.end) {
      merged.push({ ...r });
    } else {
      last.end = Math.max(last.end, r.end);
    }
  }

  const parts: Array<{ type: "plain" | "hit"; text: string }> = [];
  let cursor = 0;
  for (const r of merged) {
    if (cursor < r.start) {
      parts.push({ type: "plain", text: text.slice(cursor, r.start) });
    }
    parts.push({ type: "hit", text: text.slice(r.start, r.end) });
    cursor = r.end;
  }
  if (cursor < text.length) {
    parts.push({ type: "plain", text: text.slice(cursor) });
  }
  return parts;
}
