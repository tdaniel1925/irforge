-- Phantom cleanup — APPLY. Based on the Step-1 report from RUN-THIS-phantom-cleanup.sql.
-- Run once in the Supabase SQL editor. Targets specific reviewed rows only.
--
-- Decisions:
--   • Delete 4 safe phantoms (owners are active members of a real company).
--   • socials@americanfusionenergy.com → add to American Fusion, then delete phantom.
--   • mk@xnergy.com → LEFT ALONE (unknown; will show as Unlinked on the Users page).

begin;

-- ── 1) socials@ → add to American Fusion, then its phantom becomes safe ──
do $$
declare
  amfn_id  uuid := '1095bcf2-3c8d-41d4-877f-ae4ff6f70b42';  -- American Fusion (from report)
  soc_id   uuid;
begin
  select id into soc_id from auth.users where lower(email) = lower('socials@americanfusionenergy.com') limit 1;
  if soc_id is not null then
    insert into public.company_users (company_id, user_id, role, status, invited_email)
    values (amfn_id, soc_id, 'member', 'active', 'socials@americanfusionenergy.com')
    on conflict (company_id, user_id) do update set role = excluded.role, status = 'active';
    raise notice 'socials@ linked to American Fusion as active member.';
  else
    raise notice 'socials@ has no auth user — skipped linking.';
  end if;
end $$;

-- ── 2) Delete the reviewed phantom companies by id ──
--   4 confirmed-safe + socials@'s (now safe after the link above).
delete from public.companies
where id in (
  '0869d05f-9702-4be2-a2f2-fd20c3f477b3',  -- bn@  → AMFN
  'aa424a31-5e5f-44ba-a503-57e1dc2bb269',  -- fd@  → AMFN
  '60a6c96f-3e5a-43e7-9e80-214bcf7302cf',  -- jd@  → AMFN
  '718f0794-6c7e-4a0e-80c8-2c8880229ef3',  -- sellag.sb → Tonner
  'f5c1f55d-cc8d-4578-a863-57c873587f8d'   -- socials@ → AMFN (linked above)
);
-- NOTE: 9ce8f303-...-d1b3 (mk@xnergy.com) is intentionally NOT deleted.

commit;

-- ── Verify: AMFN's team should now include fd@, bn@, jd@, socials@ ──
select cu.role, cu.status, u.email
from public.company_users cu
join auth.users u on u.id = cu.user_id
where cu.company_id = '1095bcf2-3c8d-41d4-877f-ae4ff6f70b42'
order by u.email;
