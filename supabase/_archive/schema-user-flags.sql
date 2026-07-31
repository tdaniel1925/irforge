-- ─────────────────────────────────────────────────────────────────────────────
-- user_flags — small per-user UI flags (e.g. has the user opened the Learn
-- library). Used by the /setup checklist for real progress detection.
-- Idempotent. Run anytime.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.user_flags (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  learn_visited  boolean default false,
  updated_at     timestamptz default now()
);

alter table public.user_flags enable row level security;

-- A user only ever reads/writes their own flags.
drop policy if exists user_flags_own on public.user_flags;
create policy user_flags_own on public.user_flags for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
