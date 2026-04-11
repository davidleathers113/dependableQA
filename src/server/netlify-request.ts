import crypto from "node:crypto";

export interface NetlifyRequestLike {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  isBase64Encoded?: boolean;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function parseNetlifyRequestBody(body: string | null | undefined, isBase64Encoded?: boolean) {
  if (!body) {
    return "";
  }

  if (isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf8");
  }

  return body;
}

export function getHeaderValue(
  headers: Record<string, string | undefined> | undefined,
  headerName: string
) {
  if (!headers) {
    return "";
  }

  const expected = headerName.trim().toLowerCase();
  if (!expected) {
    return "";
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.trim().toLowerCase() === expected) {
      return asString(value).trim();
    }
  }

  return "";
}

export function safeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createHmacSha256Hex(secret: string, payload: string) {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}
