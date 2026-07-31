-- Phantom company cleanup. Run in the Supabase SQL editor.
--
-- A "phantom" is an EMPTY companies row (no name, no ticker, not onboarded, no
-- posts, no paid/comped status) that the signup trigger minted for a user who is
-- really a TEAM MEMBER of another company. These pollute the admin customer list.
--
-- This script is SAFE: STEP 1 only REPORTS. STEP 2 deletes ONLY phantoms whose
-- owner already has an ACTIVE membership on some OTHER real company (so deleting
-- the phantom cannot orphan anyone). Ambiguous phantoms are left for you to
-- review. Nothing is deleted until you uncomment STEP 2.

-- ── Identify phantoms ──
-- (empty identity + not onboarded + no posts + not paying/comped)
create temporary view _phantoms as
select c.id, c.owner_id, c.created_at
from public.companies c
where coalesce(c.name, '') = ''
  and coalesce(c.ticker, '') = ''
  and coalesce(c.onboarding_complete, false) = false
  and coalesce(c.subscription_status, 'none') not in ('active', 'past_due')
  and c.archived_at is null
  and not exists (select 1 from public.iros_posts p where p.company_id = c.id);

-- ── STEP 1 — REPORT (read-only) ──
-- For each phantom: the owner's email, and the OTHER real company they're an
-- active member of (if any). "safe_to_delete" = owner is a member elsewhere.
select
  ph.id                                as phantom_company_id,
  u.email                              as owner_email,
  other.company_id                     as belongs_to_company_id,
  oc.name                              as belongs_to_name,
  oc.ticker                            as belongs_to_ticker,
  (other.company_id is not null)       as safe_to_delete
from _phantoms ph
left join auth.users u on u.id = ph.owner_id
left join lateral (
  select cu.company_id
  from public.company_users cu
  join public.companies rc on rc.id = cu.company_id
  where cu.user_id = ph.owner_id
    and cu.status = 'active'
    and cu.company_id <> ph.id
    and (coalesce(rc.name,'') <> '' or coalesce(rc.ticker,'') <> '' or rc.onboarding_complete)
  order by cu.created_at asc
  limit 1
) other on true
left join public.companies oc on oc.id = other.company_id
order by safe_to_delete desc, owner_email;

-- ── STEP 2 — DELETE the safe ones (uncomment to run) ──
-- Deletes ONLY phantoms whose owner is an active member of another REAL company.
-- Their FK-cascaded child rows go too; the user keeps their real membership.
--
-- delete from public.companies c
-- using _phantoms ph
-- where c.id = ph.id
--   and exists (
--     select 1 from public.company_users cu
--     join public.companies rc on rc.id = cu.company_id
--     where cu.user_id = ph.owner_id
--       and cu.status = 'active'
--       and cu.company_id <> ph.id
--       and (coalesce(rc.name,'') <> '' or coalesce(rc.ticker,'') <> '' or rc.onboarding_complete)
--   );
