-- ─────────────────────────────────────────────────────────────────────────────
-- TEAM ACCOUNTS — Phase 2: invite tokens.
-- Adds a single-use token to company_users so an admin can email an invite and
-- the recipient can claim it. Idempotent. Run after schema-team.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.company_users add column if not exists invite_token text;
create index if not exists company_users_token_idx on public.company_users (invite_token);

-- Accepting an invite (setting user_id + status='active' on your own invited row)
-- happens via the service role in the API after we verify the token + email match,
-- so no extra RLS policy is needed here.
