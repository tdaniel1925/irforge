-- Company suspension — a real freeze, distinct from archive (which only hides a
-- company from admin lists). suspended_at != null means:
--   • the company's public page (/t/TICKER) shows "profile not available"
--   • the company's team is locked out of the workspace (suspension screen)
--   • no chats, board posts, or publishing can happen (all flow through the
--     getMyCompany chokepoint, which surfaces the suspended state)
-- Reversible: clearing suspended_at restores full access.

alter table public.companies add column if not exists suspended_at timestamptz;
alter table public.companies add column if not exists suspended_reason text default '';
