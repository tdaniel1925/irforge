create table if not exists public.user_workspace (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  body        text not null default '',
  pinned      boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists user_workspace_owner_idx on public.user_workspace (company_id, user_id, updated_at desc);

alter table public.user_workspace enable row level security;
drop policy if exists user_workspace_own on public.user_workspace;
create policy user_workspace_own on public.user_workspace for all
  using (user_id = auth.uid() and company_id in (select public.my_company_ids()))
  with check (user_id = auth.uid() and company_id in (select public.my_company_ids()));
