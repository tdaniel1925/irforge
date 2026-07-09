-- Investors must set a username before posting to a discussion board (so posts are
-- never tagged with an auto-generated placeholder). profile_complete flips true when
-- the member saves their profile with a real display name / handle.
-- Safe to run multiple times.

alter table public.members
  add column if not exists profile_complete boolean not null default false;

-- Backfill: existing members who already customized their display name (anything other
-- than the raw email local part) are treated as complete so we don't lock them out.
-- Conservative — only sets true, never false.
update public.members m
set profile_complete = true
where profile_complete = false
  and coalesce(display_name, '') <> ''
  and display_name not similar to '%[0-9a-f]{4}';  -- skip obvious auto-suffixed values
