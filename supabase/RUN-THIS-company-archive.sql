-- Customer Management: soft-archive support. archived_at set = the company is
-- archived (hidden from active lists, access revoked in app logic). Hard delete is
-- a separate destructive action handled in the admin API. Additive + idempotent.

alter table public.companies
  add column if not exists archived_at timestamptz;

create index if not exists companies_archived_idx
  on public.companies (archived_at) where archived_at is not null;
