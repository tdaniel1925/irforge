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
