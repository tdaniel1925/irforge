-- Add Tavares (tavaresdavis81@gmail.com) as an ADMIN on American Fusion ($AMFN)
-- so he can log in and set up their social accounts.
--
-- Handles both cases:
--   (a) Tavares already has a PubcoZone account → link him as an ACTIVE admin.
--   (b) He doesn't yet → create an INVITED admin row keyed to his email; it
--       activates automatically when he signs up with that email.
--
-- Run once in the Supabase SQL editor. Idempotent.

do $$
declare
  amfn_id uuid;
  tav_id  uuid;
begin
  -- Resolve the American Fusion company id (by ticker; fall back to name).
  select id into amfn_id
  from public.companies
  where upper(ticker) = 'AMFN'
     or lower(name) like 'american fusion%'
  order by created_at asc
  limit 1;

  if amfn_id is null then
    raise exception 'American Fusion company not found (ticker AMFN). Aborting.';
  end if;

  -- Does Tavares already have an auth account?
  select id into tav_id
  from auth.users
  where lower(email) = lower('tavaresdavis81@gmail.com')
  limit 1;

  if tav_id is not null then
    -- (a) Existing user → active admin membership. Upsert by (company_id, user_id).
    insert into public.company_users (company_id, user_id, role, status, invited_email)
    values (amfn_id, tav_id, 'admin', 'active', 'tavaresdavis81@gmail.com')
    on conflict (company_id, user_id)
    do update set role = 'admin', status = 'active';
    raise notice 'Linked existing user % as ACTIVE admin on American Fusion.', tav_id;
  else
    -- (b) No account yet → invited admin row keyed to email (activates on signup).
    if not exists (
      select 1 from public.company_users
      where company_id = amfn_id and lower(invited_email) = lower('tavaresdavis81@gmail.com')
    ) then
      insert into public.company_users (company_id, user_id, role, status, invited_email, invited_at)
      values (amfn_id, null, 'admin', 'invited', 'tavaresdavis81@gmail.com', now());
    else
      update public.company_users
      set role = 'admin'
      where company_id = amfn_id and lower(invited_email) = lower('tavaresdavis81@gmail.com');
    end if;
    raise notice 'Created/updated INVITED admin for tavaresdavis81@gmail.com — he becomes active when he signs up with that email.';
  end if;
end $$;

-- Verify: should show Tavares as an admin on American Fusion.
select cu.role, cu.status, cu.invited_email, c.name, c.ticker
from public.company_users cu
join public.companies c on c.id = cu.company_id
where (upper(c.ticker) = 'AMFN' or lower(c.name) like 'american fusion%')
  and (lower(cu.invited_email) = lower('tavaresdavis81@gmail.com')
       or cu.user_id in (select id from auth.users where lower(email) = lower('tavaresdavis81@gmail.com')));
