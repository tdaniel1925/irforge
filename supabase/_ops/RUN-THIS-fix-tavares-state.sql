-- Fix Tavares's state after the signup-ordering bug.
--
-- When he signed up, the signup trigger minted him an EMPTY company, and the old
-- getMyCompany() returned that owned company BEFORE checking his pending AMFN
-- invite — so he landed on a new company's upgrade page instead of American Fusion.
--
-- This script:
--   1) deletes the empty phantom company the trigger minted for him,
--   2) ensures his American Fusion admin membership is correctly set so his next
--      login lands him on AMFN.
--
-- Safe + idempotent. Run once in the Supabase SQL editor, then have Tavares log
-- out and back in.

do $$
declare
  tav_id  uuid;
  amfn_id uuid;
begin
  select id into tav_id from auth.users where lower(email) = lower('tavaresdavis81@gmail.com') limit 1;
  if tav_id is null then
    raise notice 'No auth account for tavaresdavis81@gmail.com — he has not signed up yet. Nothing to fix.';
    return;
  end if;

  select id into amfn_id
  from public.companies
  where (upper(ticker) = 'AMFN' or lower(name) like 'american fusion%')
    and owner_id is distinct from tav_id   -- the REAL AMFN, not his phantom
  order by created_at asc
  limit 1;
  if amfn_id is null then
    raise exception 'American Fusion company not found. Aborting.';
  end if;

  -- 1) Remove his phantom empty company + its membership rows.
  delete from public.company_users
  where user_id = tav_id
    and company_id in (
      select id from public.companies
      where owner_id = tav_id and coalesce(name,'') = '' and coalesce(ticker,'') = ''
    );
  delete from public.companies
  where owner_id = tav_id and coalesce(name,'') = '' and coalesce(ticker,'') = '';

  -- 2) Make sure he has an ACTIVE admin membership on the real American Fusion.
  insert into public.company_users (company_id, user_id, role, status, invited_email)
  values (amfn_id, tav_id, 'admin', 'active', 'tavaresdavis81@gmail.com')
  on conflict (company_id, user_id) do update set role = 'admin', status = 'active';

  -- Clear any leftover invited-by-email row now that he's linked directly.
  delete from public.company_users
  where company_id = amfn_id and user_id is null
    and lower(invited_email) = lower('tavaresdavis81@gmail.com');

  raise notice 'Fixed: Tavares is now an ACTIVE admin on American Fusion; phantom company removed.';
end $$;

-- Verify: should show one row — Tavares, admin, active, on American Fusion.
select cu.role, cu.status, c.name, c.ticker
from public.company_users cu
join public.companies c on c.id = cu.company_id
join auth.users u on u.id = cu.user_id
where lower(u.email) = lower('tavaresdavis81@gmail.com');
