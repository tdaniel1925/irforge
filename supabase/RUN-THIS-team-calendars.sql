-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-calendar system: IR / Tech / General / Personal calendars per company,
-- with admin-assigned per-user visibility. Additive + idempotent.
-- Run once in the Supabase SQL editor. See the Dru call action items.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── team_calendars: a named calendar belonging to a company ──
--   kind 'ir'      — investor-relations calendar (existing IR events live here too)
--   kind 'tech'    — tech / development side
--   kind 'general' — everyone in the company can see it
--   kind 'personal'— a single user's own calendar (owner_user_id set)
create table if not exists public.team_calendars (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  kind          text not null default 'general',     -- ir | tech | general | personal
  name          text not null default '',
  color         text not null default 'emerald',
  owner_user_id uuid references auth.users(id) on delete cascade,  -- set only for 'personal'
  created_at    timestamptz default now()
);
create index if not exists team_calendars_company_idx on public.team_calendars (company_id);
alter table public.team_calendars enable row level security;
drop policy if exists team_calendars_read on public.team_calendars;
-- A user can read a calendar if: it's general, it's their own personal one, OR
-- they've been granted access to it (see calendar_access). Admins see all.
create policy team_calendars_read on public.team_calendars for select using (
  company_id in (select public.my_company_ids())
  and (
    kind = 'general'
    or owner_user_id = auth.uid()
    or public.is_company_admin(company_id)
    or id in (select calendar_id from public.calendar_access where user_id = auth.uid())
  )
  or public.is_super_admin()
);
drop policy if exists team_calendars_write on public.team_calendars;
-- Only admins create/rename/delete calendars (and any user manages their own personal one).
create policy team_calendars_write on public.team_calendars for all using (
  (company_id in (select public.my_company_ids()) and (public.is_company_admin(company_id) or owner_user_id = auth.uid()))
  or public.is_super_admin()
) with check (
  (company_id in (select public.my_company_ids()) and (public.is_company_admin(company_id) or owner_user_id = auth.uid()))
  or public.is_super_admin()
);

-- ── calendar_access: which user can see which calendar (admin-assigned) ──
create table if not exists public.calendar_access (
  calendar_id uuid not null references public.team_calendars(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (calendar_id, user_id)
);
create index if not exists calendar_access_user_idx on public.calendar_access (user_id);
alter table public.calendar_access enable row level security;
drop policy if exists calendar_access_read on public.calendar_access;
create policy calendar_access_read on public.calendar_access for select using (
  user_id = auth.uid() or public.is_company_admin(company_id) or public.is_super_admin()
);
drop policy if exists calendar_access_write on public.calendar_access;
-- Only admins assign/revoke calendar access.
create policy calendar_access_write on public.calendar_access for all using (
  public.is_company_admin(company_id) or public.is_super_admin()
) with check (
  public.is_company_admin(company_id) or public.is_super_admin()
);

-- ── team_calendar_events: an event on a specific calendar ──
create table if not exists public.team_calendar_events (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.team_calendars(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  title       text not null default '',
  event_date  date not null,
  event_time  text default '',                         -- optional 'HH:MM' label
  type        text default 'custom',                   -- earnings|meeting|reminder|holiday|...
  note        text default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);
create index if not exists team_calendar_events_cal_idx  on public.team_calendar_events (calendar_id, event_date);
alter table public.team_calendar_events enable row level security;
drop policy if exists team_calendar_events_read on public.team_calendar_events;
-- You can read an event if you can read its calendar.
create policy team_calendar_events_read on public.team_calendar_events for select using (
  calendar_id in (select id from public.team_calendars) or public.is_super_admin()
);
drop policy if exists team_calendar_events_write on public.team_calendar_events;
-- Anyone who can see the calendar can add events to it (general/team collaboration);
-- RLS on team_calendars already restricts which calendars are visible.
create policy team_calendar_events_write on public.team_calendar_events for all using (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
) with check (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
);

-- ── Seed the standard calendars for any company that has none yet ──
insert into public.team_calendars (company_id, kind, name, color)
select c.id, k.kind, k.name, k.color
from public.companies c
cross join (values
  ('ir', 'IR Calendar', 'emerald'),
  ('tech', 'Tech & Dev', 'sky'),
  ('general', 'General', 'violet')
) as k(kind, name, color)
where not exists (
  select 1 from public.team_calendars tc where tc.company_id = c.id and tc.kind = k.kind
);
