-- CRM contact upgrades (client request):
--   • company_name — free-text company (replaces the dropdown that required
--     pre-creating a CRM company; you can now just TYPE the company name).
--   • shares_held  — number of shares an investor holds.
--   • opted_in     — internal flag: this investor opted in to updates.
-- Safe to run multiple times.

alter table public.crm_contacts add column if not exists company_name text default '';
alter table public.crm_contacts add column if not exists shares_held  numeric;
alter table public.crm_contacts add column if not exists opted_in     boolean not null default false;

-- Backfill company_name from the linked crm_company (if any) so existing links show.
update public.crm_contacts c
set company_name = co.name
from public.crm_companies co
where c.crm_company_id = co.id
  and coalesce(c.company_name, '') = '';
