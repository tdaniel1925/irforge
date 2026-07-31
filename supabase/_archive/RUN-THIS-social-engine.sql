-- ─────────────────────────────────────────────────────────────────────────────
-- Social Content Engine ("Predis for IRForge")
-- Step 1 (strategy) + Step 3 (per-post media/platform) schema.
-- Additive + idempotent. Run once in the Supabase SQL editor.
-- See docs/social-engine-plan.md.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── social_strategy: one row per company. The interview output + posting plan
--    that seeds calendar + draft generation. ──
create table if not exists public.social_strategy (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  goals           text default '',                 -- what the company wants from social
  audience        text default '',                 -- who they're talking to
  tone            text default 'professional',      -- voice/tone descriptor
  themes          text[] default '{}',              -- content pillars / recurring topics
  platforms       text[] default '{}',              -- ayrshare channel keys to publish to
  posts_per_week  int  default 3,
  dos             text[] default '{}',              -- explicit "always do" guidance
  donts           text[] default '{}',              -- explicit "never do" guidance
  voice_profile_id uuid,                            -- optional link to an iros voice profile
  interview_complete boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (company_id)                               -- one strategy per company
);
alter table public.social_strategy enable row level security;
drop policy if exists social_strategy_rw on public.social_strategy;
create policy social_strategy_rw on public.social_strategy for all
  using (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin())
  with check (company_id in (select id from public.companies where owner_id = auth.uid()) or public.is_super_admin());

-- ── Extend iros_posts: a calendar slot IS a post. Add the platform it's
--    formatted for, the generated image URL, and the content theme. ──
alter table public.iros_posts add column if not exists platform   text default '';
alter table public.iros_posts add column if not exists media_url   text default '';
alter table public.iros_posts add column if not exists theme       text default '';
alter table public.iros_posts add column if not exists calendar_batch uuid;  -- groups a generated calendar run

-- Publish tracking (for the delivery dashboard): the Ayrshare post id we hand
-- off, the live URL once posted, and the last publish error if it failed.
alter table public.iros_posts add column if not exists ayr_post_id  text default '';
alter table public.iros_posts add column if not exists post_url     text default '';
alter table public.iros_posts add column if not exists publish_error text default '';
alter table public.iros_posts add column if not exists posted_at    timestamptz;

create index if not exists iros_posts_calendar_batch_idx
  on public.iros_posts (calendar_batch) where calendar_batch is not null;

-- ── Storage bucket for AI-generated post images (public read; Ayrshare needs a
--    public URL for mediaUrls). Idempotent. ──
insert into storage.buckets (id, name, public)
  values ('social-images', 'social-images', true)
  on conflict (id) do nothing;
