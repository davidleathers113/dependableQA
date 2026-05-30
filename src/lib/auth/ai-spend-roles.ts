/**
 * Roles permitted to trigger billable AI work (transcription/analysis) and to
 * run the recording-readiness preflight. The allowlist is explicit — rather than
 * "any member" — so a future read-only role is denied AI spend by default
 * instead of silently inheriting it. Shared by /api/calls/analyze-selected and
 * /api/calls/verify-recording.
 */
export const AI_SPEND_ROLES: ReadonlySet<string> = new Set([
  "owner",
  "admin",
  "billing",
  "reviewer",
  "analyst",
]);

export function canSpendAi(role: string): boolean {
  return AI_SPEND_ROLES.has(role);
}
