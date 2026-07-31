-- Company page claim + verification. Extends claim_requests with the fields the
-- verification form collects, plus a PRIVATE storage bucket for the proof documents
-- (registration/authorization letter + a government ID of the person on the filing).
-- Safe to run multiple times.

alter table public.claim_requests
  add column if not exists company_name text,
  add column if not exists phone       text,
  add column if not exists title       text,
  add column if not exists relationship text,     -- officer | director | IR | authorized agent
  add column if not exists notes       text,       -- what they told us
  add column if not exists doc_paths   text[] not null default '{}',  -- storage paths of uploaded proof
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

-- Private bucket for claim proof docs. NOT public — only the service role (admin API)
-- reads them via signed URLs. Insert is done server-side with the service key too.
insert into storage.buckets (id, name, public)
values ('claim-docs', 'claim-docs', false)
on conflict (id) do nothing;

-- No public storage policies: all reads/writes go through the service role (admin API
-- + the claim submit endpoint), which bypasses RLS. This keeps IDs and letters private.
