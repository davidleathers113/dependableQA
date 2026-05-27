# ADR 0001: Astro SSR with React islands

- **Status:** Accepted
- **Date:** 2026-04-10

## Context

The product is an authenticated, data-heavy QA operations app (tables, filters, drawers, a synchronized call-review workspace) that also benefits from fast first paint and good auth/SEO defaults on public pages. The starting point was the Netlify Astro + Supabase template. A pure SPA would add client boot weight and complicate auth gating; pure server rendering would make the interactive surfaces painful.

## Decision

Build as an Astro SSR app shell with **React islands** for the high-interactivity sections only:

- Astro handles routing, route-level SSR, layouts, and auth gating in middleware.
- React (19) hydrates per-screen islands under `src/features/**`.
- Pages server-render initial state, then islands take over with TanStack Query for client-side invalidation.

## Consequences

- Fast first paint and controlled hydration; less client JS than an SPA.
- Clean Netlify deployment ergonomics (adapter + functions).
- A discipline cost: server-only code (`src/server/**`, service-role client, OpenAI/Stripe SDKs) must never be imported into an island. This boundary is load-bearing — see [ADR 0002](0002-three-supabase-clients-and-tenant-isolation.md).
