-- ─────────────────────────────────────────────────────────────────────────────
-- company_stats — a flat, queryable snapshot of the screenable facts for the
-- "breakout universe" (tickers trending / moving today). Populated nightly by the
-- snapshot cron from the same audit the public ticker pages use. The AI screener
-- queries THIS table (fast, structured) instead of re-auditing live.
--
-- These are FACTS for filtering/research — never recommendations. Additive +
-- idempotent. Run after schema-platform.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.company_stats (
  ticker              text primary key,
  company_name        text default '',
  -- universe / freshness
  in_universe_reason  text default '',           -- why it's tracked (trending source, mover, traffic)
  trend_score         numeric default 0,         -- blended "hotness" from getMarketTrending
  snapshot_at         timestamptz default now(),
  -- market
  price               numeric,
  change_pct_3mo      numeric,
  last_volume         numeric,
  avg_volume_3mo      numeric,
  volume_ratio        numeric,                   -- last_volume / avg_volume_3mo (the "spike")
  market_cap          numeric,
  high_52             numeric,
  low_52              numeric,
  -- fundamentals
  cash                numeric,
  revenue_annual      numeric,
  net_income_annual   numeric,
  shares_outstanding  numeric,
  shares_change_pct_1y numeric,                  -- dilution: >0 dilutive, <=0 "no dilution"
  runway_quarters     numeric,
  -- insider (Form 4)
  insider_buys        integer default 0,
  insider_sells       integer default 0,
  insider_net         integer default 0,         -- buys - sells
  form4_count_180d    integer default 0,
  -- short interest
  short_pct           numeric,
  -- filings / catalysts / risk
  filings_12mo        integer default 0,
  last_filing_date    text default '',
  last_form           text default '',
  trials_total        integer default 0,
  contracts_count     integer default 0,
  halts_count         integer default 0,
  -- sentiment (from the board / social)
  bullish             integer default 0,
  bearish             integer default 0,
  -- overall visibility grade from the audit
  grade               text default '',
  score               numeric default 0,
  -- profile
  industry            text default '',
  exchange            text default ''
);

-- Helpful indexes for the common screens.
create index if not exists company_stats_volume_ratio_idx on public.company_stats (volume_ratio desc);
create index if not exists company_stats_dilution_idx     on public.company_stats (shares_change_pct_1y);
create index if not exists company_stats_insider_net_idx  on public.company_stats (insider_net desc);
create index if not exists company_stats_trend_idx        on public.company_stats (trend_score desc);
create index if not exists company_stats_snapshot_idx     on public.company_stats (snapshot_at desc);

-- Public, read-only: these are public-data facts shown on public pages. Writes
-- happen via the service role (the nightly cron). No per-user scoping needed.
alter table public.company_stats enable row level security;
drop policy if exists company_stats_read on public.company_stats;
create policy company_stats_read on public.company_stats for select using (true);
