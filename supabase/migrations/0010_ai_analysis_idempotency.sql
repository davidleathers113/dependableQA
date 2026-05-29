begin;

-- A given call has at most one analysis per analysis_version. Combined with the
-- upsert in src/server/analyze-call.ts, a reprocessed or duplicate analysis job
-- (e.g. one re-run after its lease expired) updates the existing row instead of
-- inserting a duplicate "current" analysis for the same version.
alter table public.call_analyses
  add constraint call_analyses_unique_version
  unique (organization_id, call_id, analysis_version);

commit;
