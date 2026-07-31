-- Supabase environment stubs — for building a CLEAN local/CI Postgres only.
--
-- The production baseline (0001) references Supabase-managed objects that live
-- OUTSIDE the public schema: the `auth` schema (auth.users, auth.uid()) and the
-- `storage` schema. On real Supabase these are provided by the platform; on a
-- vanilla Postgres (CI, local reproducibility test) they don't exist, so the
-- baseline's foreign keys and RLS policies fail to create.
--
-- This file creates the MINIMAL stubs the baseline needs so it applies cleanly
-- to a plain Postgres. It is a TEST/CI scaffold — it is NOT applied to
-- production (production already has the real auth/storage schemas). Ordered
-- 0000 so it runs before the baseline.

create schema if not exists auth;
create schema if not exists storage;

-- Minimal auth.users: enough columns for FKs + email lookups the app uses.
create table if not exists auth.users (
  id            uuid primary key default gen_random_uuid(),
  email         text,
  created_at    timestamptz default now(),
  user_metadata jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- auth.uid() — returns the current request's user id. On Supabase this reads a
-- JWT claim; the stub returns NULL (no authenticated user in a bare CI DB), which
-- is correct for policy-creation and lets RLS policies compile.
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
