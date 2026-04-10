import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';
import tailwindcss from "@tailwindcss/vite";

import react from '@astrojs/react';

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