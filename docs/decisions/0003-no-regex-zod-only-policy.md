# ADR 0003: No regex; Zod for validation

- **Status:** Accepted
- **Date:** 2026-04-10

## Context

User-supplied and provider-supplied input is parsed throughout the ingest, webhook, and API surfaces. Hand-written regular expressions are a common source of ReDoS (Regular Expression Denial of Service) vulnerabilities and subtle parsing bugs, and are easy to introduce unintentionally.

## Decision

Do not use regular expressions anywhere in the codebase — no `new RegExp`, literal `/pattern/`, or `.match` / `.test` / `.exec` / `.replace` with a pattern. Instead:

- **Validation:** Zod schemas (see `src/lib/call-review-api-schemas.ts`, `src/lib/integration-config.ts`).
- **String work:** `includes`, `startsWith`, `endsWith`, `indexOf`, `substring`.
- **URLs:** the `URL` constructor.
- **Structured output:** Zod via `zodTextFormat` for OpenAI responses.

## Consequences

- Eliminates the ReDoS attack surface and centralizes validation in declarative schemas.
- Some parsing (e.g. Ringba timestamp formats in `integration-ingest.ts`) is more verbose than a regex would be — accepted as the cost of the policy.
- Reviewers should reject any new regex on sight; reach for a maintained parser/validator instead.
