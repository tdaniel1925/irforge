-- Per-company Ayrshare user profile key.
-- Each company links its OWN socials via an Ayrshare "User Profile" (Business Plan);
-- generateJWT + every publish call sends this as the Profile-Key header so posts go
-- to that company's accounts and never the platform primary account.
--
-- Without this column the connect flow's saved profileKey was silently dropped on
-- write (companyToRow had no mapping + no column), so the key never persisted in
-- production — every publish fell back to the primary account.
--
-- Run once in the Supabase SQL editor.

alter table public.companies
  add column if not exists ayrshare_profile_key text default '';
