-- Reaction integrity: one reaction per member per post per kind.
--
-- Reactions were anonymous unlimited counter bumps — one visitor could click
-- "agree" thousands of times (and did: 1,187 agrees on an 11-post board). Each
-- reaction is now a ROW tied to the signed-in member, unique per (post, member,
-- kind), toggled off by reacting again. Counters on public_board.reactions are
-- recomputed from these rows on every toggle.
-- Safe to run multiple times.

create table if not exists public.board_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.public_board(id) on delete cascade,
  member_id uuid not null,
  kind text not null check (kind in ('agree','source','question','report')),
  created_at timestamptz not null default now(),
  unique (post_id, member_id, kind)
);

create index if not exists board_reactions_post_idx on public.board_reactions (post_id);

-- Service-role writes only (same posture as public_board after the lockdown).
alter table public.board_reactions enable row level security;

-- The old anonymous counters are not attributable to anyone and are provably
-- inflated — reset them so displayed counts always equal real member reactions.
update public.public_board
set reactions = '{"agree":0,"source":0,"question":0,"report":0}'::jsonb;
