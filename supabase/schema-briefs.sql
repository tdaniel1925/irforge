-- ─────────────────────────────────────────────────────────────────────────────
-- Sponsored Research Briefs — paid, disclosed, AI-prepared company profiles.
-- Additive + idempotent. Run after schema-platform.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sponsored_briefs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  ticker        text default '',
  title         text default '',
  markdown      text default '',
  disclosure    text default '',
  status        text default 'ordered',  -- ordered | paid | generated | published
  stripe_session_id text,
  published     boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.sponsored_briefs enable row level security;

-- Company owners read their own briefs; super admins read all. PUBLISHED briefs
-- are world-readable (they're meant to be posted publicly).
drop policy if exists briefs_read on public.sponsored_briefs;
create policy briefs_read on public.sponsored_briefs for select using (
  published = true
  or company_id in (select id from public.companies where owner_id = auth.uid())
  or public.is_super_admin()
);
-- Writes happen via the service role (after Stripe payment is confirmed).
