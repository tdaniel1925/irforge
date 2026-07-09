-- Daily ticker-view buckets — powers "trending this week", per-ticker traffic
-- charts, and the media-kit numbers ("investors researching $X this month").
-- The existing ticker_views stays as the all-time counter; this adds the time axis.
-- Safe to run multiple times.

create table if not exists public.ticker_views_daily (
  ticker text not null,
  day date not null default current_date,
  views integer not null default 0,
  primary key (ticker, day)
);

alter table public.ticker_views_daily enable row level security;
-- service-role writes only; no client policies needed.

create or replace function public.bump_ticker_views_daily(t text)
returns void
language sql
security definer
as $$
  insert into public.ticker_views_daily (ticker, day, views)
  values (upper(t), current_date, 1)
  on conflict (ticker, day)
  do update set views = ticker_views_daily.views + 1;
$$;
