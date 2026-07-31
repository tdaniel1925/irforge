-- ─────────────────────────────────────────────────────────────────────────────
-- Member (individual investor) accounts — runs ALONGSIDE company accounts.
-- Additive + backward-compatible. Run AFTER schema.sql / schema-billing.sql /
-- schema-public.sql. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) members: one row per individual-investor auth user.
create table if not exists public.members (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  display_name           text not null default '',
  handle                 text not null,
  bio                    text default '',
  avatar_url             text default '',
  plan                   text default 'free',          -- free | member_plus
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text default 'none',
  created_at             timestamptz default now(),
  unique (user_id),
  unique (handle)
);

alter table public.members enable row level security;

-- Self read/write only.
drop policy if exists members_self on public.members;
create policy members_self on public.members
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Public-safe identity columns for board display (no stripe/email leakage).
-- RLS is row-level not column-level, so we expose a view rather than a select policy.
create or replace view public.member_public as
  select id, handle, display_name, avatar_url from public.members;
grant select on public.member_public to anon, authenticated;

-- 2) Backward-compatible signup trigger: ONLY auto-create a company for company
--    signups. Absence of metadata defaults to 'company', so every existing path
--    (and any client not yet sending account_type) is unchanged. Member rows are
--    created app-side by getMyMember() to handle handle-uniqueness cleanly.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  if coalesce(new.raw_user_meta_data->>'account_type', 'company') = 'company' then
    insert into public.companies (owner_id, name, ticker)
    values (new.id, '', '')
    on conflict (owner_id) do nothing;
  end if;
  return new;
end;
$$;
-- (trigger on_auth_user_created already bound in schema.sql — replacing the
--  function is enough.)

-- 3) Link board posts to a member identity (denormalized so public reads need no
--    member-table access). Legacy anonymous posts keep member_id = null.
alter table public.public_board add column if not exists member_id uuid references public.members(id) on delete set null;
alter table public.public_board add column if not exists author_avatar text default '';
create index if not exists public_board_member_idx on public.public_board (member_id);

-- Members can read their own posts (for the activity feed) in addition to the
-- existing public read policy.
drop policy if exists board_self_read on public.public_board;
create policy board_self_read on public.public_board for select
  using (member_id in (select id from public.members where user_id = auth.uid()));

-- 4) Watchlist — reuse the existing watches table, add a member owner key.
alter table public.watches add column if not exists member_id uuid references public.members(id) on delete cascade;
create index if not exists watches_member_idx on public.watches (member_id);

drop policy if exists watches_self_read on public.watches;
create policy watches_self_read on public.watches for select
  using (member_id in (select id from public.members where user_id = auth.uid()));
drop policy if exists watches_self_write on public.watches;
create policy watches_self_write on public.watches for all
  using (member_id in (select id from public.members where user_id = auth.uid()))
  with check (member_id in (select id from public.members where user_id = auth.uid()));

-- 5) Avatar storage bucket (public read; users write only under their own uid/).
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
