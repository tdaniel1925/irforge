-- OAuth 2.0 authorization server for the integration gateway. Additive +
-- idempotent. Run once in the Supabase SQL editor.
--
-- PubcoZone becomes an OAuth provider so clients (Claude via MCP, Jordyn) get a
-- "Connect PubcoZone" experience instead of copy-pasting a bearer token. An
-- OAuth access token resolves to the SAME ActorContext as an integration token —
-- every Phase 2/3 gate (company isolation, scopes, two-phase confirm, audit) is
-- reused. This just adds a new front door.
--
-- Only hashes of long-lived secrets are stored. Design points:
--   - Dynamic Client Registration: clients self-register; registration grants
--     NOTHING — data access requires a human to consent at /oauth/authorize.
--   - Auth Code + PKCE only (no implicit flow).
--   - Access token 1h; refresh token 90-day SLIDING window (each use resets the
--     clock) with rotation + reuse-detection.

-- Registered clients (via DCR). client_secret is optional (public PKCE clients
-- like Claude Desktop have none); redirect URIs are exact-matched at authorize.
create table if not exists public.oauth_clients (
  id                uuid primary key default gen_random_uuid(),
  client_id         text not null unique,
  client_secret_hash text,                          -- null for public/PKCE clients
  client_name       text not null default '',
  redirect_uris     text[] not null default '{}',   -- exact-match allowlist
  created_at        timestamptz default now()
);

-- Short-lived authorization codes (single-use, PKCE-bound). ~10 min TTL.
create table if not exists public.oauth_auth_codes (
  id             uuid primary key default gen_random_uuid(),
  code_hash      text not null unique,
  client_id      text not null,
  company_id     uuid not null references public.companies(id) on delete cascade,
  subject_user   uuid not null references auth.users(id) on delete cascade,
  subject_email  text not null default '',
  role           text not null default 'member',
  scopes         text[] not null default '{}',
  redirect_uri   text not null,
  code_challenge text not null default '',           -- PKCE S256 challenge
  created_at     timestamptz default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz
);

-- Long-lived grants: one row per authorized (client × subject × company). Holds
-- the CURRENT refresh-token hash; rotation replaces it and bumps last_used_at.
-- reuse-detection: presenting a refresh hash that isn't the current one revokes
-- the whole grant (prev_refresh_hash lets us recognize the just-rotated token).
create table if not exists public.oauth_grants (
  id                 uuid primary key default gen_random_uuid(),
  client_id          text not null,
  company_id         uuid not null references public.companies(id) on delete cascade,
  subject_user       uuid not null references auth.users(id) on delete cascade,
  subject_email      text not null default '',
  role               text not null default 'member',
  scopes             text[] not null default '{}',
  refresh_hash       text not null unique,
  prev_refresh_hash  text,
  issued_at          timestamptz default now(),
  last_used_at       timestamptz default now(),      -- sliding window anchor
  expires_at         timestamptz not null,           -- last_used + 90d, bumped on refresh
  revoked_at         timestamptz
);
create index if not exists oauth_grants_lookup_idx on public.oauth_grants (client_id, subject_user, company_id);

-- Short-lived access tokens: stored by hash so a token → grant lookup is O(1)
-- and so revoking a grant can cascade. ~1h TTL.
create table if not exists public.oauth_access_tokens (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique,
  grant_id      uuid not null references public.oauth_grants(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  subject_user  uuid,
  subject_email text not null default '',
  role          text not null default 'member',
  scopes        text[] not null default '{}',
  created_at    timestamptz default now(),
  expires_at    timestamptz not null
);
create index if not exists oauth_access_tokens_grant_idx on public.oauth_access_tokens (grant_id);

-- Service-role only — the gateway/services always scope by company_id explicitly.
alter table public.oauth_clients enable row level security;
alter table public.oauth_auth_codes enable row level security;
alter table public.oauth_grants enable row level security;
alter table public.oauth_access_tokens enable row level security;
