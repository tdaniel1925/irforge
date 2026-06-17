-- ─────────────────────────────────────────────────────────────────────────────
-- TEAM ACCOUNTS — Phase 1: multi-user companies via a membership join table.
--
-- Moves from "one auth user owns one company" to "many users belong to one
-- company, each with a role". Existing owners are migrated to an ADMIN membership
-- so nothing breaks. Every company-scoped RLS policy is rewritten to use
-- my_company_ids() instead of `owner_id = auth.uid()`.
--
-- Idempotent. Run after schema.sql + schema-crm/iros/platform/briefs.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Membership table -----------------------------------------------------------
create table if not exists public.company_users (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,  -- null until an invite is accepted
  role          text not null default 'member',   -- 'admin' | 'member'
  status        text not null default 'active',    -- 'active' | 'invited'
  invited_email text default '',
  invited_at    timestamptz,
  created_at    timestamptz default now(),
  unique (company_id, user_id)
);
create index if not exists company_users_user_idx    on public.company_users (user_id);
create index if not exists company_users_company_idx on public.company_users (company_id);
create index if not exists company_users_invite_idx  on public.company_users (lower(invited_email));

-- 2) Drop the one-company-per-user constraint (a user may belong to several) -----
alter table public.companies drop constraint if exists companies_owner_id_key;

-- 3) Migrate every existing owner to an ADMIN membership ------------------------
insert into public.company_users (company_id, user_id, role, status)
select c.id, c.owner_id, 'admin', 'active'
from public.companies c
where c.owner_id is not null
on conflict (company_id, user_id) do nothing;

-- 4) Helper functions -----------------------------------------------------------
-- All company IDs the current user can access: active memberships + (back-compat)
-- any company they directly own. SECURITY DEFINER so the policy can read the join
-- table without recursing through its own RLS.
create or replace function public.my_company_ids()
returns setof uuid language sql security definer stable as $$
  select cu.company_id
    from public.company_users cu
   where cu.user_id = auth.uid() and cu.status = 'active'
  union
  select c.id from public.companies c where c.owner_id = auth.uid();
$$;

-- Is the current user an ADMIN of a given company (owner counts as admin)?
create or replace function public.is_company_admin(cid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.company_users cu
     where cu.company_id = cid and cu.user_id = auth.uid()
       and cu.status = 'active' and cu.role = 'admin'
  ) or exists (
    select 1 from public.companies c where c.id = cid and c.owner_id = auth.uid()
  );
$$;

-- 5) company_users RLS ----------------------------------------------------------
alter table public.company_users enable row level security;

-- Members can SEE the roster of companies they belong to.
drop policy if exists company_users_read on public.company_users;
create policy company_users_read on public.company_users for select using (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
);
-- Only admins can add/modify/remove memberships (invites, role changes, removal).
drop policy if exists company_users_write on public.company_users;
create policy company_users_write on public.company_users for all using (
  public.is_company_admin(company_id) or public.is_super_admin()
) with check (
  public.is_company_admin(company_id) or public.is_super_admin()
);

-- 6) Rewrite company-scoped RLS to membership ----------------------------------
-- companies: any active member can read/update their company; super admins all.
drop policy if exists companies_owner on public.companies;
drop policy if exists companies_members on public.companies;
create policy companies_members on public.companies for all using (
  id in (select public.my_company_ids()) or public.is_super_admin()
) with check (
  id in (select public.my_company_ids()) or public.is_super_admin()
);

-- company_data
drop policy if exists company_data_owner on public.company_data;
drop policy if exists company_data_members on public.company_data;
create policy company_data_members on public.company_data for all using (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
) with check (
  company_id in (select public.my_company_ids()) or public.is_super_admin()
);

-- CRM tables (crm_contacts, crm_companies, crm_deals, crm_tasks, crm_activities)
do $$
declare t text;
begin
  foreach t in array array['crm_contacts','crm_companies','crm_deals','crm_tasks','crm_activities']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists %I_members on public.%I', t, t);
      execute format('drop policy if exists %I_owner on public.%I', t, t);
      execute format($f$create policy %I_members on public.%I for all using (
        company_id in (select public.my_company_ids()) or public.is_super_admin()
      ) with check (
        company_id in (select public.my_company_ids()) or public.is_super_admin()
      )$f$, t, t);
    end if;
  end loop;
end $$;

-- IR-OS tables (iros_posts, iros_approvals, iros_voices, iros_stakeholders, iros_quiet_periods)
do $$
declare t text;
begin
  foreach t in array array['iros_posts','iros_approvals','iros_voices','iros_stakeholders','iros_quiet_periods']
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists %I_members on public.%I', t, t);
      execute format($f$create policy %I_members on public.%I for all using (
        company_id in (select public.my_company_ids()) or public.is_super_admin()
      ) with check (
        company_id in (select public.my_company_ids()) or public.is_super_admin()
      )$f$, t, t);
    end if;
  end loop;
end $$;

-- platform: company_features (per-company feature flags)
do $$
begin
  if to_regclass('public.company_features') is not null then
    execute 'drop policy if exists company_features_read on public.company_features';
    execute $f$create policy company_features_read on public.company_features for select using (
      company_id in (select public.my_company_ids()) or public.is_super_admin()
    )$f$;
  end if;
end $$;

-- sponsored_briefs: members read their company's briefs; published world-readable.
do $$
begin
  if to_regclass('public.sponsored_briefs') is not null then
    execute 'drop policy if exists briefs_read on public.sponsored_briefs';
    execute $f$create policy briefs_read on public.sponsored_briefs for select using (
      published = true
      or company_id in (select public.my_company_ids())
      or public.is_super_admin()
    )$f$;
  end if;
end $$;

-- 7) New-user trigger: still mint a company for a brand-new COMPANY signup, and
-- give that founder an admin membership. (Members/investors don't get a company.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare new_company_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'account_type', 'company') <> 'member' then
    insert into public.companies (owner_id, name, ticker)
    values (new.id, '', '')
    returning id into new_company_id;
    insert into public.company_users (company_id, user_id, role, status)
    values (new_company_id, new.id, 'admin', 'active')
    on conflict (company_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
