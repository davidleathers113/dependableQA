import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

import react from '@astrojs/react';

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
    server: {
      allowedHosts: ['.netlify.app']
    }
  },

  adapter: netlify(),
  integrations: [react()]
});