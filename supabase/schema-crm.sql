-- ─────────────────────────────────────────────────────────────────────────────
-- CRM — a unified, HubSpot/Salesforce-style CRM. Contacts ↔ Companies ↔ Deals,
-- Activities, Tasks, Tags, Pipeline stages. RLS-scoped to the owning company (or
-- super-admin). Additive + idempotent. Run after schema-platform.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── crm_companies: organizations (funds, firms, outlets) ──
create table if not exists public.crm_companies (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,  -- the tenant
  name        text not null default '',
  domain      text default '',
  type        text default 'other',     -- fund | analyst_firm | media | partner | vendor | other
  industry    text default '',
  city        text default '',
  state       text default '',
  website     text default '',
  notes       text default '',
  owner_email text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.crm_companies enable row level security;
drop policy if exists crm_companies_rw on public.crm_companies;
create policy crm_companies_rw on public.crm_companies for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());
create index if not exists crm_companies_tenant_idx on public.crm_companies (company_id);

-- ── crm_contacts: people (linked to a crm_company) ──
create table if not exists public.crm_contacts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,  -- tenant
  crm_company_id uuid references public.crm_companies(id) on delete set null,      -- where they work
  full_name     text not null default '',
  title         text default '',
  email         text default '',
  phone         text default '',
  category      text default 'investor', -- investor | analyst | journalist | partner | procurement | talent | shareholder | other
  stage         text default 'new',      -- contact lifecycle: new | engaged | active | holder | passed
  linkedin_url  text default '',
  x_handle      text default '',
  topics        text[] default '{}',
  aum           text default '',          -- for funds: assets under management (freeform)
  peers_held    text[] default '{}',      -- tickers this fund is known to hold (13F intel)
  notes         text default '',
  owner_email   text default '',
  last_touch_at timestamptz,
  next_followup date,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.crm_contacts enable row level security;
drop policy if exists crm_contacts_rw on public.crm_contacts;
create policy crm_contacts_rw on public.crm_contacts for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());
create index if not exists crm_contacts_tenant_idx on public.crm_contacts (company_id);
create index if not exists crm_contacts_company_idx on public.crm_contacts (crm_company_id);

-- ── crm_deals: opportunities through a pipeline ──
create table if not exists public.crm_deals (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,  -- tenant
  title         text not null default '',
  stage         text not null default 'lead', -- lead | qualified | meeting | proposal | won | lost
  value         numeric default 0,
  currency      text default 'USD',
  contact_id    uuid references public.crm_contacts(id) on delete set null,
  crm_company_id uuid references public.crm_companies(id) on delete set null,
  close_date    date,
  status        text default 'open',          -- open | won | lost
  notes         text default '',
  owner_email   text default '',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.crm_deals enable row level security;
drop policy if exists crm_deals_rw on public.crm_deals;
create policy crm_deals_rw on public.crm_deals for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());
create index if not exists crm_deals_tenant_idx on public.crm_deals (company_id);

-- ── crm_activities: the timeline (calls, emails, meetings, notes, inbound) ──
create table if not exists public.crm_activities (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,  -- tenant
  contact_id    uuid references public.crm_contacts(id) on delete cascade,
  crm_company_id uuid references public.crm_companies(id) on delete cascade,
  deal_id       uuid references public.crm_deals(id) on delete cascade,
  kind          text default 'note',      -- call | email | meeting | note | inbound | task_done
  direction     text default 'outbound',  -- inbound | outbound | n/a
  summary       text default '',
  body          text default '',
  ai_reply      text default '',          -- AI-suggested reply for inbound
  occurred_at   timestamptz default now(),
  actor_email   text default '',
  created_at    timestamptz default now()
);
alter table public.crm_activities enable row level security;
drop policy if exists crm_activities_rw on public.crm_activities;
create policy crm_activities_rw on public.crm_activities for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());
create index if not exists crm_activities_contact_idx on public.crm_activities (contact_id);
create index if not exists crm_activities_tenant_idx on public.crm_activities (company_id);

-- ── crm_tasks: to-dos with due dates + owner ──
create table if not exists public.crm_tasks (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,  -- tenant
  title         text not null default '',
  due_date      date,
  done          boolean default false,
  contact_id    uuid references public.crm_contacts(id) on delete set null,
  deal_id       uuid references public.crm_deals(id) on delete set null,
  owner_email   text default '',
  created_at    timestamptz default now()
);
alter table public.crm_tasks enable row level security;
drop policy if exists crm_tasks_rw on public.crm_tasks;
create policy crm_tasks_rw on public.crm_tasks for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());
create index if not exists crm_tasks_tenant_idx on public.crm_tasks (company_id);

-- Tags live as a text[] on contacts/companies (crm_contacts.topics already serves
-- this for contacts; reuse simple arrays rather than a join table for v1 simplicity).
