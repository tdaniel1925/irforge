-- Canonicalize iros_posts.status. Additive + idempotent. Run once in the
-- Supabase SQL editor.
--
-- Background: the daily-suggestions cron wrote status 'pending' — not a state in
-- the canonical model (draft → reviewed → approved → scheduled → published →
-- pulled). No query reads 'pending' from iros_posts, so those rows were invisible
-- in every view. Rescue them into 'draft' (the entry state — they surface in
-- Needs-approval), then lock the column so no future code path can invent states.

-- 1) Rescue orphaned rows.
update public.iros_posts set status = 'draft', updated_at = now()
where status = 'pending';

-- 2) Belt-and-suspenders: constrain the column to the canonical vocabulary.
--    (Verified: rejections are stored as 'pulled' and publish failures live in
--    publish_error — no other status strings are ever written.)
alter table public.iros_posts drop constraint if exists iros_posts_status_canon;
alter table public.iros_posts add constraint iros_posts_status_canon
  check (status in ('draft','reviewed','approved','scheduled','published','pulled'));
