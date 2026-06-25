-- Per-user home-dashboard layout: which widgets are shown and in what order.
-- Stored on the existing per-(company,user) team_profiles row. Additive +
-- idempotent. Run once in the Supabase SQL editor.

alter table public.team_profiles
  add column if not exists dashboard_layout jsonb;

-- Shape: { "order": ["intel","read","agenda",...], "hidden": ["markets"] }
-- Null = use the default layout (handled in code).
