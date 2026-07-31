-- Public data persistence (board posts, leads, view counts) for production.
-- Run in the Supabase SQL editor. public_board + claim_requests already exist from
-- schema.sql / schema-billing.sql; this adds the rest and a rate-limit table.

-- Lead capture (public audit "claim this page" emails).
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null,
  name        text not null,
  email       text not null,
  role        text,
  created_at  timestamptz default now()
);
alter table public.leads enable row level security;
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert with check (true);
drop policy if exists leads_admin_read on public.leads;
create policy leads_admin_read on public.leads for select using (
  exists (select 1 from public.companies where owner_id = auth.uid() and is_admin = true)
);

-- Watch / alert subscriptions: "email me about $TICKER".
create table if not exists public.watches (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null,
  email       text not null,
  created_at  timestamptz default now(),
  unique (ticker, email)
);
alter table public.watches enable row level security;
drop policy if exists watches_insert on public.watches;
create policy watches_insert on public.watches for insert with check (true);
drop policy if exists watches_admin_read on public.watches;
create policy watches_admin_read on public.watches for select using (
  exists (select 1 from public.companies where owner_id = auth.uid() and is_admin = true)
);

-- Per-ticker last-seen snapshot, used by the alert worker to detect what changed
-- (so each filing/insider trade/halt/grade change is emailed exactly once).
create table if not exists public.watch_snapshots (
  ticker      text primary key,
  snapshot    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);
alter table public.watch_snapshots enable row level security;
-- Service-role only (the cron worker); no client policies.

-- Per-ticker public page view counts.
create table if not exists public.ticker_views (
  ticker      text primary key,
  views       bigint default 0,
  updated_at  timestamptz default now()
);
alter table public.ticker_views enable row level security;
drop policy if exists views_all on public.ticker_views;
create policy views_all on public.ticker_views for select using (true);

-- Atomic view-increment so concurrent visitors don't clobber each other.
create or replace function public.bump_ticker_views(t text)
returns bigint language plpgsql security definer as $$
declare v bigint;
begin
  insert into public.ticker_views (ticker, views) values (t, 1)
  on conflict (ticker) do update set views = ticker_views.views + 1, updated_at = now()
  returning views into v;
  return v;
end; $$;

-- Simple rate-limit log: one row per (key, window) bucket.
create table if not exists public.rate_limits (
  bucket      text not null,        -- e.g. 'board:1.2.3.4:202606121430'
  hits        int default 1,
  created_at  timestamptz default now(),
  primary key (bucket)
);
alter table public.rate_limits enable row level security;
-- No client access; only the service role (server) touches this.

create or replace function public.rate_check(b text, max_hits int)
returns boolean language plpgsql security definer as $$
declare h int;
begin
  insert into public.rate_limits (bucket, hits) values (b, 1)
  on conflict (bucket) do update set hits = rate_limits.hits + 1
  returning hits into h;
  return h <= max_hits;  -- true = allowed
end; $$;
