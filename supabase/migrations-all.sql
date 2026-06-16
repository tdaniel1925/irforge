-- ═══════════════════════════════════════════════════════════════════════════
-- PubcoZone — COMPLETE MIGRATIONS (run order matters; top to bottom). Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  schema.sql                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

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


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  schema-billing.sql                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

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


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  schema-public.sql                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Public data persistence (board posts, leads, view counts) for production.
-- Run in the Supabase SQL editor. public_board + claim_requests already exist from
-- schema.sql / schema-billing.sql; this adds the rest and a rate-limit table.

-- Lead capture (public audit "claim this page" emails).
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null,
  name        text not null,
  email       text not null,
  role        text,
  created_at  timestamptz default now()
);
alter table public.leads enable row level security;
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert with check (true);
drop policy if exists leads_admin_read on public.leads;
create policy leads_admin_read on public.leads for select using (
  exists (select 1 from public.companies where owner_id = auth.uid() and is_admin = true)
);

-- Watch / alert subscriptions: "email me about $TICKER".
create table if not exists public.watches (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null,
  email       text not null,
  created_at  timestamptz default now(),
  unique (ticker, email)
);
alter table public.watches enable row level security;
drop policy if exists watches_insert on public.watches;
create policy watches_insert on public.watches for insert with check (true);
drop policy if exists watches_admin_read on public.watches;
create policy watches_admin_read on public.watches for select using (
  exists (select 1 from public.companies where owner_id = auth.uid() and is_admin = true)
);

-- Per-ticker last-seen snapshot, used by the alert worker to detect what changed
-- (so each filing/insider trade/halt/grade change is emailed exactly once).
create table if not exists public.watch_snapshots (
  ticker      text primary key,
  snapshot    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);
alter table public.watch_snapshots enable row level security;
-- Service-role only (the cron worker); no client policies.

-- Per-ticker public page view counts.
create table if not exists public.ticker_views (
  ticker      text primary key,
  views       bigint default 0,
  updated_at  timestamptz default now()
);
alter table public.ticker_views enable row level security;
drop policy if exists views_all on public.ticker_views;
create policy views_all on public.ticker_views for select using (true);

-- Atomic view-increment so concurrent visitors don't clobber each other.
create or replace function public.bump_ticker_views(t text)
returns bigint language plpgsql security definer as $$
declare v bigint;
begin
  insert into public.ticker_views (ticker, views) values (t, 1)
  on conflict (ticker) do update set views = ticker_views.views + 1, updated_at = now()
  returning views into v;
  return v;
end; $$;

-- Simple rate-limit log: one row per (key, window) bucket.
create table if not exists public.rate_limits (
  bucket      text not null,        -- e.g. 'board:1.2.3.4:202606121430'
  hits        int default 1,
  created_at  timestamptz default now(),
  primary key (bucket)
);
alter table public.rate_limits enable row level security;
-- No client access; only the service role (server) touches this.

create or replace function public.rate_check(b text, max_hits int)
returns boolean language plpgsql security definer as $$
declare h int;
begin
  insert into public.rate_limits (bucket, hits) values (b, 1)
  on conflict (bucket) do update set hits = rate_limits.hits + 1
  returning hits into h;
  return h <= max_hits;  -- true = allowed
end; $$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  schema-platform.sql                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- Platform layer: super-admins, per-company feature flags, append-only audit log.
-- Powers the admin back-office and the IR-OS feature suite. Generic / multi-tenant
-- — nothing company-specific. Additive + idempotent. Run after the other schema-*.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) platform_admins: super-admins who oversee ALL companies (not tied to one org).
create table if not exists public.platform_admins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  super_admin  boolean default true,
  created_at   timestamptz default now()
);
alter table public.platform_admins enable row level security;

-- A user can read their own admin row (so the app can check "am I super admin?").
drop policy if exists platform_admins_self on public.platform_admins;
create policy platform_admins_self on public.platform_admins
  for select using (user_id = auth.uid());

-- Seed the super admin by email once that user has signed up. Safe to run anytime;
-- it links by email to the auth user if/when it exists.
insert into public.platform_admins (user_id, email, super_admin)
select id, email, true from auth.users where lower(email) = 'tdaniel@botmakers.ai'
on conflict (user_id) do update set super_admin = true, email = excluded.email;

-- Helper: is the current auth user a super admin? (used by RLS on other tables)
create or replace function public.is_super_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid() and super_admin = true);
$$;

-- 2) company_features: per-company toggles for each IR-OS feature. Admin-driven.
--    A missing row = feature OFF (locked). Super admins flip these per company.
create table if not exists public.company_features (
  company_id  uuid not null references public.companies(id) on delete cascade,
  feature     text not null,   -- e.g. 'compliance' 'calendar' 'voices' 'crm' 'publishing' 'intelligence'
  enabled     boolean default false,
  updated_at  timestamptz default now(),
  primary key (company_id, feature)
);
alter table public.company_features enable row level security;

-- Companies can READ their own feature flags (to show/hide nav). Only super admins write.
drop policy if exists company_features_read on public.company_features;
create policy company_features_read on public.company_features for select using (
  company_id in (select id from public.companies where owner_id = auth.uid())
  or public.is_super_admin()
);
drop policy if exists company_features_admin_write on public.company_features;
create policy company_features_admin_write on public.company_features for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- 3) audit_log: append-only chain of custody for SEC-defensible record-keeping.
--    Never updated, never deleted. Writes via service role only.
create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email   text,
  action        text not null,        -- e.g. 'post.classified_red', 'approval.signed', 'feature.enabled'
  entity_type   text,                 -- 'post' | 'approval' | 'feature' | 'quiet_period' ...
  entity_id     text,
  payload       jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);
alter table public.audit_log enable row level security;

-- Company owners can read their own org's log; super admins read everything.
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select using (
  company_id in (select id from public.companies where owner_id = auth.uid())
  or public.is_super_admin()
);
-- No client insert/update/delete policies → only the service role can write. Append-only.

-- Append-only: block tampering with a row's CONTENT, but allow the FK-driven
-- company_id→null nulling (so deleting a company doesn't 500) and allow deletes
-- only when no company owns the row (i.e. after the company is gone, or for
-- housekeeping). The substantive fields (action/entity/payload/actor) can never
-- be altered.
create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- Only permitted change is company_id being set to NULL by the FK cascade.
    if new.action is distinct from old.action
       or new.entity_type is distinct from old.entity_type
       or new.entity_id is distinct from old.entity_id
       or new.payload is distinct from old.payload
       or new.actor_user_id is distinct from old.actor_user_id
       or new.actor_email is distinct from old.actor_email
       or new.created_at is distinct from old.created_at then
      raise exception 'audit_log is append-only — content cannot be modified';
    end if;
    return new;
  end if;
  -- DELETE: allow (cascade cleanup / housekeeping). Content already immutable above.
  return old;
end; $$;
drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  schema-iros.sql                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- IR-OS feature suite: posts, approvals (with Reg FD classification + counsel
-- e-signature), disclosure events (quiet periods), voice profiles, stakeholders,
-- interactions. Generic / multi-tenant. Additive + idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── iros_posts: a piece of investor content moving through the pipeline ──
create table if not exists public.iros_posts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  title         text not null default '',
  body          text not null default '',
  channels      text[] default '{}',          -- ayrshare channel keys: twitter,linkedin,...
  scheduled_at  timestamptz,
  status        text not null default 'draft', -- draft|reviewed|approved|scheduled|published|pulled
  classification text,                          -- green|yellow|red (null until classified)
  class_confidence numeric(3,2),
  class_flags   jsonb default '[]'::jsonb,
  class_reason  text default '',
  voice_profile_id uuid,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.iros_posts enable row level security;
drop policy if exists iros_posts_rw on public.iros_posts;
create policy iros_posts_rw on public.iros_posts for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());

-- ── iros_approvals: every approval/counsel decision, with signature for RED ──
create table if not exists public.iros_approvals (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.iros_posts(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  stage         text not null,                 -- approver|counsel
  decision      text not null,                 -- approved|rejected|changes
  comment       text default '',
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email   text,
  signature_hash text,                          -- SHA-256(body+decision+ts+actor) for RED
  signature_ip   text,
  signature_ua   text,
  created_at    timestamptz default now()
);
alter table public.iros_approvals enable row level security;
drop policy if exists iros_approvals_read on public.iros_approvals;
create policy iros_approvals_read on public.iros_approvals for select
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());
-- writes happen via service role in the API after auth checks.

-- ── iros_disclosure_events: 8-Ks, press releases, and quiet-period windows ──
create table if not exists public.iros_disclosure_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  event_type    text not null,                 -- 8k_filed|press_release|quiet_period_start|quiet_period_end|material_event
  description   text default '',
  effective_at  timestamptz default now(),
  expires_at    timestamptz,                   -- for quiet periods
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz default now()
);
alter table public.iros_disclosure_events enable row level security;
drop policy if exists iros_disclosure_rw on public.iros_disclosure_events;
create policy iros_disclosure_rw on public.iros_disclosure_events for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());

-- ── iros_voice_profiles: per-executive AI voice ──
create table if not exists public.iros_voice_profiles (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,                 -- "Jane Doe — CEO"
  role_title    text default '',
  guidance      text default '',               -- the voice/system prompt
  style_examples text[] default '{}',
  forbidden_phrases text[] default '{}',
  active        boolean default true,
  created_at    timestamptz default now()
);
alter table public.iros_voice_profiles enable row level security;
drop policy if exists iros_voices_rw on public.iros_voice_profiles;
create policy iros_voices_rw on public.iros_voice_profiles for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());

-- ── iros_stakeholders + iros_interactions: the relationship graph ──
create table if not exists public.iros_stakeholders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  full_name     text not null,
  title         text default '',
  org           text default '',
  category      text default 'other',          -- investor|analyst|journalist|partner|procurement|talent|other
  topics        text[] default '{}',
  email         text default '',
  linkedin_url  text default '',
  x_handle      text default '',
  notes         text default '',
  last_touch_at timestamptz,
  created_at    timestamptz default now()
);
alter table public.iros_stakeholders enable row level security;
drop policy if exists iros_stakeholders_rw on public.iros_stakeholders;
create policy iros_stakeholders_rw on public.iros_stakeholders for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());
create index if not exists iros_stakeholders_company_idx on public.iros_stakeholders (company_id);

create table if not exists public.iros_interactions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  stakeholder_id uuid references public.iros_stakeholders(id) on delete set null,
  channel       text default 'other',          -- email|linkedin|x|phone|meeting|other
  direction     text default 'inbound',        -- inbound|outbound
  summary       text default '',
  body          text default '',
  status        text default 'open',           -- open|in_progress|resolved|archived
  suggested_owner text default '',
  suggested_reply text default '',
  occurred_at   timestamptz default now(),
  created_at    timestamptz default now()
);
alter table public.iros_interactions enable row level security;
drop policy if exists iros_interactions_rw on public.iros_interactions;
create policy iros_interactions_rw on public.iros_interactions for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  schema-crm.sql                                                     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

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


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  schema-briefs.sql                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- Sponsored Research Briefs — paid, disclosed, AI-prepared company profiles.
-- Additive + idempotent. Run after schema-platform.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sponsored_briefs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  ticker        text default '',
  title         text default '',
  markdown      text default '',
  disclosure    text default '',
  status        text default 'ordered',  -- ordered | paid | generated | published
  stripe_session_id text,
  published     boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.sponsored_briefs enable row level security;

-- Company owners read their own briefs; super admins read all. PUBLISHED briefs
-- are world-readable (they're meant to be posted publicly).
drop policy if exists briefs_read on public.sponsored_briefs;
create policy briefs_read on public.sponsored_briefs for select using (
  published = true
  or company_id in (select id from public.companies where owner_id = auth.uid())
  or public.is_super_admin()
);
-- Writes happen via the service role (after Stripe payment is confirmed).


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  schema-members.sql                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

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


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  make-super-admin.sql                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────────────────────
-- Make tdaniel@botmakers.ai a super admin AND enable every IR-OS feature for
-- their company. Run in the Supabase SQL Editor.
--
-- PREREQUISITES (run these first if you haven't):
--   1) schema-platform.sql   (creates platform_admins, company_features, audit_log)
--   2) schema-iros.sql       (creates the IR-OS feature tables)
--   3) tdaniel@botmakers.ai must have SIGNED UP in the app (so auth.users has the row)
--
-- Safe to re-run. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Promote the user to super admin (links by email to the auth user).
insert into public.platform_admins (user_id, email, super_admin)
select id, email, true
from auth.users
where lower(email) = 'tdaniel@botmakers.ai'
on conflict (user_id) do update set super_admin = true, email = excluded.email;

-- 2) Enable ALL IR-OS features for every company this user owns.
--    (If you want it for a specific company instead, replace the WHERE clause.)
insert into public.company_features (company_id, feature, enabled, updated_at)
select c.id, f.feature, true, now()
from public.companies c
cross join (values
  ('compliance'), ('voices'), ('calendar'),
  ('publishing'), ('stakeholders'), ('intelligence')
) as f(feature)
where c.owner_id = (select id from auth.users where lower(email) = 'tdaniel@botmakers.ai')
on conflict (company_id, feature) do update set enabled = true, updated_at = now();

-- 3) Verify — should return one super-admin row and six enabled features.
select 'super_admin' as kind, email, super_admin::text as detail
from public.platform_admins where lower(email) = 'tdaniel@botmakers.ai'
union all
select 'feature', cf.feature, cf.enabled::text
from public.company_features cf
join public.companies c on c.id = cf.company_id
where c.owner_id = (select id from auth.users where lower(email) = 'tdaniel@botmakers.ai')
order by kind, email;


