-- Investor Updates: a company can broadcast an update to investors who OPTED IN
-- on its public page (crm_contacts.opted_in = true). This table logs each send —
-- what went out, to how many, and when — so the company has a history of its
-- investor communications. Per-recipient delivery is tracked in email_events.

create table if not exists public.iros_investor_updates (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  subject          text not null default '',
  body             text not null default '',
  recipient_count  integer not null default 0,
  sent_by          uuid references auth.users(id) on delete set null,
  sent_by_email    text default '',
  created_at       timestamptz default now()
);
create index if not exists iros_investor_updates_company_idx
  on public.iros_investor_updates (company_id, created_at desc);

alter table public.iros_investor_updates enable row level security;

-- A company's members can read their own update history; RLS scopes by company.
drop policy if exists iros_investor_updates_read on public.iros_investor_updates;
create policy iros_investor_updates_read on public.iros_investor_updates for select using (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
);
