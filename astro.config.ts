import { execSync } from "node:child_process";
import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

import react from '@astrojs/react';

/**
 * Resolve the git commit this build was produced from, stamped into the app at
 * build time (Vite `define` below) and surfaced by /api/version so a live deploy
 * can be mapped back to a reviewed SHA — the gap that left Netlify's
 * `commit_ref` null. Prefers the CI/Netlify-provided ref, then a local
 * `git rev-parse`, then "unknown".
 */
function resolveBuildCommitSha(): string {
  const fromEnv = process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? process.env.COMMIT_SHA;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim();
  }
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

const BUILD_COMMIT_SHA = resolveBuildCommitSha();
const BUILD_TIME = new Date().toISOString();

/**
 * Middleware and several modules read `process.env` directly. Astro's typed
 * `env.schema` wires values through `astro:env/*`, which does not always
 * mirror `process.env` in dev (e.g. plain `npm run dev` without exporting
 * variables in the shell). Merge Vite's `.env` loading once at startup so
 * `SUPABASE_*` and other keys match what `astro:env/client` sees.
 */
const nodeEnv = process.env.NODE_ENV ?? "development";
Object.assign(process.env, loadEnv(nodeEnv, process.cwd(), ""));

export default defineConfig({
  env: {
    schema: {
      SUPABASE_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      SUPABASE_DATABASE_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      SUPABASE_ANON_KEY: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
    },
  },

  markdown: {
    shikiConfig: {
      theme: 'github-light-high-contrast',
    },
  },

  vite: {
    plugins: [tailwindcss()],
    define: {
      __APP_BUILD_SHA__: JSON.stringify(BUILD_COMMIT_SHA),
      __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    server: {
      allowedHosts: ['.netlify.app']
    }
  },

  adapter: netlify(),
  integrations: [react()]
});