-- Billing + admin additions. Run in the Supabase SQL editor after schema.sql.

alter table public.companies add column if not exists stripe_customer_id text;
alter table public.companies add column if not exists stripe_subscription_id text;
alter table public.companies add column if not exists subscription_status text default 'none'; -- none | trialing | active | past_due | canceled
alter table public.companies add column if not exists is_admin boolean default false;

-- New signups start on the FREE tier (a verified public page, no dashboard tools).
-- They upgrade to a paid plan to unlock the IR tools and post responses to X.
alter table public.companies alter column tier set default 'free';

-- A claim-request queue for the public "claim this page" leads (admin verifies).
create table if not exists public.claim_requests (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null,
  name        text not null,
  email       text not null,
  role        text,
  status      text default 'pending', -- pending | verified | rejected
  created_at  timestamptz default now()
);
alter table public.claim_requests enable row level security;
-- Anyone can insert a claim request (from the public page); only admins read them.
drop policy if exists claim_insert on public.claim_requests;
create policy claim_insert on public.claim_requests for insert with check (true);
drop policy if exists claim_admin_read on public.claim_requests;
create policy claim_admin_read on public.claim_requests for select using (
  exists (select 1 from public.companies where owner_id = auth.uid() and is_admin = true)
);

-- To make yourself an admin, run (replace with your user id from auth.users):
-- update public.companies set is_admin = true where owner_id = 'YOUR-AUTH-USER-ID';
