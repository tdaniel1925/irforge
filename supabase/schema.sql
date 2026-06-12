-- IRForge multi-tenant schema. Run this in the Supabase SQL editor.
-- Model: one auth user owns one company. RLS guarantees a user only ever
-- touches their own company's data.

-- ---------------------------------------------------------------------------
-- companies: one row per company, owned by an auth user.
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null default '',
  ticker        text not null default '',
  exchange      text default '',
  cik           text default '',
  sector        text default '',
  city          text default '',
  state         text default '',
  description   text default '',
  approver_name text default '',
  approver_title text default '',
  x_handle      text default '',
  peers         text[] default '{}',
  tier          text default 'growth',
  quiet_mode    boolean default false,
  disclosure_text text default '',
  fls_text      text default '',
  onboarding_complete boolean default false,
  created_at    timestamptz default now(),
  unique (owner_id)            -- one company per user
);

-- ---------------------------------------------------------------------------
-- company_data: the working data (drafts, filings, etc.) as JSONB documents,
-- one row per (company, collection). Lets us move the existing JSON store over
-- quickly while keeping per-company isolation. We can normalize hot tables later.
-- ---------------------------------------------------------------------------
create table if not exists public.company_data (
  company_id  uuid not null references public.companies(id) on delete cascade,
  collection  text not null,           -- 'drafts' | 'filings' | 'publicQuestions' | ...
  data        jsonb not null default '[]',
  updated_at  timestamptz default now(),
  primary key (company_id, collection)
);

-- ---------------------------------------------------------------------------
-- public_board: the investor message board + Q&A. Public-readable (anyone can
-- see a ticker's board), but writes are open to all (moderated in the app layer).
-- Not tied to ownership — it's the public square.
-- ---------------------------------------------------------------------------
create table if not exists public.public_board (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null,
  author      text not null default 'Anonymous',
  body        text not null,
  verified    boolean default false,
  flag        text default 'chatter',
  flag_reason text default '',
  parent_id   uuid,
  reactions   jsonb default '{"agree":0,"source":0,"question":0,"report":0}',
  created_at  timestamptz default now()
);
create index if not exists public_board_ticker_idx on public.public_board (ticker, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_data enable row level security;
alter table public.public_board enable row level security;

-- companies: owner-only for everything.
drop policy if exists companies_owner on public.companies;
create policy companies_owner on public.companies
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- company_data: accessible only if you own the parent company.
drop policy if exists company_data_owner on public.company_data;
create policy company_data_owner on public.company_data
  for all using (
    company_id in (select id from public.companies where owner_id = auth.uid())
  ) with check (
    company_id in (select id from public.companies where owner_id = auth.uid())
  );

-- public_board: anyone (even anon) can read; anyone authenticated-or-anon can insert
-- (the app moderates). No updates/deletes from the client.
drop policy if exists board_read on public.public_board;
create policy board_read on public.public_board for select using (true);
drop policy if exists board_insert on public.public_board;
create policy board_insert on public.public_board for insert with check (true);

-- ---------------------------------------------------------------------------
-- Auto-create an empty company when a user signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.companies (owner_id, name, ticker)
  values (new.id, '', '')
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
