-- Paste into Supabase dashboard -> SQL Editor -> New query -> Run.
-- Creates the company_stats table the AI investor screener queries.

create table if not exists public.company_stats (
  ticker              text primary key,
  company_name        text default '',
  in_universe_reason  text default '',
  trend_score         numeric default 0,
  snapshot_at         timestamptz default now(),
  price               numeric,
  change_pct_3mo      numeric,
  last_volume         numeric,
  avg_volume_3mo      numeric,
  volume_ratio        numeric,
  market_cap          numeric,
  high_52             numeric,
  low_52              numeric,
  cash                numeric,
  revenue_annual      numeric,
  net_income_annual   numeric,
  shares_outstanding  numeric,
  shares_change_pct_1y numeric,
  runway_quarters     numeric,
  insider_buys        integer default 0,
  insider_sells       integer default 0,
  insider_net         integer default 0,
  form4_count_180d    integer default 0,
  short_pct           numeric,
  filings_12mo        integer default 0,
  last_filing_date    text default '',
  last_form           text default '',
  trials_total        integer default 0,
  contracts_count     integer default 0,
  halts_count         integer default 0,
  bullish             integer default 0,
  bearish             integer default 0,
  grade               text default '',
  score               numeric default 0,
  industry            text default '',
  exchange            text default ''
);

create index if not exists company_stats_volume_ratio_idx on public.company_stats (volume_ratio desc);
create index if not exists company_stats_dilution_idx     on public.company_stats (shares_change_pct_1y);
create index if not exists company_stats_insider_net_idx  on public.company_stats (insider_net desc);
create index if not exists company_stats_trend_idx        on public.company_stats (trend_score desc);
create index if not exists company_stats_snapshot_idx     on public.company_stats (snapshot_at desc);

alter table public.company_stats enable row level security;
drop policy if exists company_stats_read on public.company_stats;
create policy company_stats_read on public.company_stats for select using (true);
