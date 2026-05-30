begin;

-- Harden the Ringba pixel ingest lookup. Previously the pixel handler scanned
-- every ringba integration and compared the plaintext config.ringba.publicIngestKey
-- with `===` (O(n) over all tenants, non-timing-safe). Add a stored generated
-- column holding the SHA-256 hex of that key so the handler can look the
-- integration up by an indexed equality on the hash — O(1), single-row, and no
-- per-tenant plaintext comparison.
--
-- The column is GENERATED (not a denormalized copy), so it stays in sync with
-- config on every write with no application changes, and it is not insertable
-- (existing inserts are unaffected). digest() lives in the `extensions` schema
-- and is IMMUTABLE, so it is valid inside a generated-column expression. The
-- hex output matches Node's crypto.createHash("sha256").update(key).digest("hex"),
-- which is what the runtime handler computes.
alter table public.integrations
  add column if not exists public_ingest_key_hash text
  generated always as (
    case
      when nullif(config #>> '{ringba,publicIngestKey}', '') is null then null
      else encode(extensions.digest(config #>> '{ringba,publicIngestKey}', 'sha256'), 'hex')
    end
  ) stored;

-- Unique: an ingest key identifies exactly one integration. Partial so the many
-- non-ringba integrations (null hash) don't collide.
create unique index if not exists idx_integrations_public_ingest_key_hash
  on public.integrations (public_ingest_key_hash)
  where public_ingest_key_hash is not null;

commit;
