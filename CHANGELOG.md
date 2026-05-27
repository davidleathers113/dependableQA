# Changelog

All notable changes to DependableQA are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

User-facing release notes are also published in-app via the `updates` content collection (`src/content/updates/`); this file is the engineering mirror.

## [Unreleased]

### Changed
- Documentation overhaul: introduced the `docs/` reference tree (architecture, data model, AI pipeline, integrations, operations, environment, testing), seeded ADRs, rewrote the README, and added `CONTRIBUTING.md` / `SECURITY.md`.

### Removed
- Retired the original Astro Supabase Starter docs (`USAGE.md`, starter content guides) and the historical rebuild blueprints.

## [1.0.0] - 2026-04-10

### Added
- Initial release of the auditable call-QA operations system: Astro SSR + React islands app shell, Supabase-backed multi-tenant schema with strict row-level security, immutable source snapshots, and audit-ready ingestion flows.

## [0.9.4] - 2026-04-02

### Changed
- Analysis upgrade: stronger compliance-flag detection, clearer call summaries, and improved operational triage signals.
