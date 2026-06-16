-- ─────────────────────────────────────────────────────────────────────────────
-- Sample / demo Sponsored Research Briefs.
-- Lets us publish a public, ownerless sample brief (e.g. $MSFT) so prospective
-- customers can see what the paid product produces — without tying it to a real
-- company/auth user. Additive + idempotent. Run after schema-briefs.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- A sample brief has no owning company, so company_id must be nullable.
alter table public.sponsored_briefs alter column company_id drop not null;

-- Mark samples so we can list/feature them and keep them out of customer views.
alter table public.sponsored_briefs add column if not exists is_sample boolean default false;

-- Published briefs are already world-readable (see schema-briefs.sql:briefs_read,
-- which allows `published = true`). Samples are inserted with published = true, so
-- the existing policy covers public reads — no new policy needed.
