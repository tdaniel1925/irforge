-- Enable Supabase Realtime for the team comms tables so the right-rail chat +
-- presence update instantly (no polling lag). Safe to run multiple times.
--
-- Realtime broadcasts row changes to subscribed clients; RLS still controls what
-- each client may actually receive, so users only get events for their own company.

-- Make sure the realtime publication exists (it does by default on Supabase, but
-- this is defensive for self-hosted).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Add the comms tables to the realtime publication (idempotent guards).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_chat'
  ) then
    alter publication supabase_realtime add table public.team_chat;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_profiles'
  ) then
    alter publication supabase_realtime add table public.team_profiles;
  end if;
end $$;

-- REPLICA IDENTITY FULL lets realtime include old row data on UPDATE/DELETE, so the
-- client sees deletes/edits (not just inserts).
alter table public.team_chat replica identity full;
alter table public.team_profiles replica identity full;
