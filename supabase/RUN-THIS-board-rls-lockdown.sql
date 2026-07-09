-- SECURITY: lock down public_board writes.
--
-- The original policy (`board_insert ... with check (true)`) predates the
-- authenticated-posting migration: it let ANYONE with the public anon key insert
-- rows directly from the browser — bypassing sign-in, username, moderation, and
-- rate limits — including forged `verified = true` rows that render as official
-- "FROM THE COMPANY" answers on the public page.
--
-- Every legitimate write goes through the API using the service-role key (which
-- bypasses RLS), so no client-side insert path is needed at all. Reads stay public.
-- Safe to run multiple times.

drop policy if exists board_insert on public.public_board;

-- Belt-and-braces: make sure no update/delete policies exist either (none were
-- ever created, but drop defensively in case an old environment has them).
drop policy if exists board_update on public.public_board;
drop policy if exists board_delete on public.public_board;
