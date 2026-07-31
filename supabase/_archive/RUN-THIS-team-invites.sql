alter table public.company_users add column if not exists invite_token text;
create index if not exists company_users_token_idx on public.company_users (invite_token);
