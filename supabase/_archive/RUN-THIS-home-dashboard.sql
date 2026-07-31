-- ─────────────────────────────────────────────────────────────────────────────
-- Customizable Home Dashboard: office presence (in/out + reason), birthdays,
-- and a team quick-update board. Additive + idempotent.
-- Run once in the Supabase SQL editor. See the Dru call action items.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── team_profiles: per-(company,user) home-dashboard profile: office status,
--    reason, and birthday. One row per teammate per company. ──
create table if not exists public.team_profiles (
  company_id   uuid not null references public.companies(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text default '',
  office_status text not null default 'in',   -- in | out
  status_reason text default '',              -- e.g. "at a wedding"
  birthday     date,                          -- month/day used for birthday notices
  updated_at   timestamptz default now(),
  primary key (company_id, user_id)
);
alter table public.team_profiles enable row level security;
drop policy if exists team_profiles_read on public.team_profiles;
-- Everyone in the company can see each teammate's status/birthday.
create policy team_profiles_read on public.team_profiles for select using (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
);
drop policy if exists team_profiles_write on public.team_profiles;
-- A user manages their OWN profile; admins can manage anyone's (e.g. set birthdays).
create policy team_profiles_write on public.team_profiles for all using (
  (company_id in (select public.my_company_ids()) and (user_id = auth.uid() or public.is_company_admin(company_id)))
  or public.is_super_admin()
) with check (
  (company_id in (select public.my_company_ids()) and (user_id = auth.uid() or public.is_company_admin(company_id)))
  or public.is_super_admin()
);

-- ── team_updates: the quick-update board ("meeting at 11, won't respond"). ──
create table if not exists public.team_updates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  author_name text default '',
  body        text not null default '',
  created_at  timestamptz default now()
);
create index if not exists team_updates_company_time_idx on public.team_updates (company_id, created_at desc);
alter table public.team_updates enable row level security;
drop policy if exists team_updates_read on public.team_updates;
create policy team_updates_read on public.team_updates for select using (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
);
drop policy if exists team_updates_write on public.team_updates;
-- Anyone on the team can post a quick update; they can delete their own.
create policy team_updates_insert on public.team_updates for insert with check (
  company_id in (select public.my_company_ids())
);
create policy team_updates_delete on public.team_updates for delete using (
  user_id = auth.uid() or public.is_company_admin(company_id) or public.is_super_admin()
);
