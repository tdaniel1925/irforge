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
