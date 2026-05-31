import type { APIRoute } from "astro";

export const prerender = false;

// Public deploy-provenance probe. Returns the git commit + build time stamped
// into the bundle at build time (Vite `define`, see astro.config.ts), so a
// post-deploy smoke check can confirm the live site maps to the reviewed SHA —
// closing the gap where Netlify reported `commit_ref: null`. No secrets: the
// commit SHA is already public in the repo. The `typeof` guard keeps it safe in
// dev/unit tests where the define did not run (reports "unknown").
const commit = typeof __APP_BUILD_SHA__ !== "undefined" ? __APP_BUILD_SHA__ : "unknown";
const builtAt = typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : "unknown";

export const GET: APIRoute = () => {
  return new Response(JSON.stringify({ commit, builtAt }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // Always reflect the running deploy, never a cached prior one.
      "cache-control": "no-store",
    },
  });
};
