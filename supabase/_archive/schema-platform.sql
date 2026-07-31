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
