-- Lead Finder: build/store outreach lists of public companies sourced from SEC
-- EDGAR, with manually-verified emails and outreach send tracking.
-- Super-admin only (it's an internal sales tool). Writes go through the service role.

create table if not exists public.lead_lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Untitled list',
  note        text default '',
  created_at  timestamptz default now()
);

create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid references public.lead_lists(id) on delete cascade,
  -- Sourced from EDGAR
  cik           text default '',
  name          text not null default '',
  ticker        text default '',
  exchange      text default '',
  industry      text default '',
  phone         text default '',
  address       text default '',
  recent_form   text default '',          -- the filing that surfaced them (8-K, 10-Q, ...)
  edgar_url     text default '',
  ir_lookup_url text default '',          -- google "company investor relations contact"
  -- Manually added by the operator
  contact_name  text default '',
  email         text default '',          -- MUST be filled before an email can send
  -- Outreach state
  status        text not null default 'new', -- new | queued | sent | delivered | opened | bounced | replied | skipped
  message_id    text default '',          -- Resend id, links to email_events
  last_sent_at  timestamptz,
  notes         text default '',
  created_at    timestamptz default now(),
  unique (list_id, cik)
);

-- Targeting signals (added in the targeting upgrade; safe to re-run).
alter table public.leads add column if not exists market_cap   numeric;
alter table public.leads add column if not exists size_tier    text default 'unknown';
alter table public.leads add column if not exists price        numeric;
alter table public.leads add column if not exists fit_score    int default 0;
alter table public.leads add column if not exists fit_reason   text default '';

create index if not exists leads_list_idx on public.leads (list_id, status);
create index if not exists leads_message_idx on public.leads (message_id);
create index if not exists leads_fit_idx on public.leads (list_id, fit_score desc);

alter table public.lead_lists enable row level security;
alter table public.leads enable row level security;
drop policy if exists lead_lists_admin on public.lead_lists;
drop policy if exists leads_admin on public.leads;
create policy lead_lists_admin on public.lead_lists for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy leads_admin on public.leads for all using (public.is_super_admin()) with check (public.is_super_admin());
