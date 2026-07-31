-- Paste into Supabase dashboard -> SQL Editor -> New query -> Run.
-- Enables the public sample Sponsored Research Brief.

alter table public.sponsored_briefs alter column company_id drop not null;
alter table public.sponsored_briefs add column if not exists is_sample boolean default false;
