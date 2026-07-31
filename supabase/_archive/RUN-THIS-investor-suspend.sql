-- Investor account suspension for the Back Office. Additive + idempotent.
-- Run once in the Supabase SQL editor.
--
-- suspended_at != null means the investor is suspended: blocked from posting,
-- asking questions, and (enforced app-side) treated as inactive. Reversible —
-- clearing the column un-suspends. Deletion is a separate hard action.

alter table public.members add column if not exists suspended_at timestamptz;
alter table public.members add column if not exists suspended_reason text default '';
