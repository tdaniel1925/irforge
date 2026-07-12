-- Team chat for the right-hand comms sidebar. Company-wide room (more rooms can
-- be added later). Additive + idempotent. Run once in the Supabase SQL editor.

create table if not exists public.team_chat (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  author_name text default '',
  body        text not null default '',
  created_at  timestamptz default now()
);
create index if not exists team_chat_company_time_idx on public.team_chat (company_id, created_at desc);

alter table public.team_chat enable row level security;

drop policy if exists team_chat_read on public.team_chat;
create policy team_chat_read on public.team_chat for select using (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
);

drop policy if exists team_chat_insert on public.team_chat;
-- Members write to their own company; super-admins may write to any company they
-- are impersonating ("acting as"), matching the read policy's escape hatch.
create policy team_chat_insert on public.team_chat for insert with check (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
);

drop policy if exists team_chat_delete on public.team_chat;
-- A user can delete their own message; admins can delete any.
create policy team_chat_delete on public.team_chat for delete using (
  user_id = auth.uid() or public.is_company_admin(company_id) or public.is_super_admin()
);
