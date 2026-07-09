-- Daily usage quotas for metered investor AI tools (reality-checks, filing diffs).
-- Free users get N per day; Investor+ is unlimited. One row per (key, day);
-- the bump function increments atomically and returns the new count so the API
-- can enforce the limit in a single round trip.
-- Safe to run multiple times.

create table if not exists public.usage_daily (
  key text not null,
  day date not null default current_date,
  count integer not null default 0,
  primary key (key, day)
);

alter table public.usage_daily enable row level security;
-- service-role writes only; no client policies needed.

create or replace function public.bump_usage_daily(k text)
returns integer
language plpgsql
security definer
as $$
declare
  new_count integer;
begin
  insert into public.usage_daily (key, day, count)
  values (k, current_date, 1)
  on conflict (key, day)
  do update set count = usage_daily.count + 1
  returning count into new_count;
  return new_count;
end;
$$;
