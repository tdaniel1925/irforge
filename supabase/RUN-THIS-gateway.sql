-- Integration gateway: scoped bearer tokens + two-phase confirmation claims.
-- Additive + idempotent. Run once in the Supabase SQL editor.
--
-- Tokens let an external control plane (Jordyn) call the PubcoZone gateway with
-- a company-scoped, per-tool-scoped credential — never a browser session, never
-- the Supabase service-role key. Only a SHA-256 hash of the token is stored; the
-- plaintext exists exactly once, in the response that issued it.

create table if not exists public.iros_integration_tokens (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  token_hash    text not null unique,           -- sha256 hex of the bearer token
  token_prefix  text not null default '',       -- first 8 chars, for identification in UIs
  subject       text not null default '',       -- who this token acts as (email / connector name)
  role          text not null default 'member', -- admin | member (scope ceiling)
  scopes        text[] not null default '{}',   -- explicit per-tool scopes
  connector_id  text default '',                -- optional client identifier (e.g. jordyn subaccount)
  issued_at     timestamptz default now(),
  expires_at    timestamptz,                    -- null = no expiry (discouraged)
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_by    uuid references auth.users(id) on delete set null
);
create index if not exists iros_integration_tokens_company_idx on public.iros_integration_tokens (company_id);

-- Two-phase confirmations: prepare_* stores the exact proposed action + a hash
-- of the underlying content; execute_* requires the claim to be unused, alive,
-- and the content unchanged. Single-use is enforced by the used_at flip.
create table if not exists public.iros_confirmations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  action        text not null,                  -- e.g. approve_content, publish_content
  params        jsonb not null default '{}',    -- exact proposed parameters
  content_hash  text not null default '',       -- hash of the underlying data at prepare time
  token_id      uuid,                           -- which integration token prepared it
  request_id    text default '',
  created_at    timestamptz default now(),
  expires_at    timestamptz not null,
  used_at       timestamptz
);
create index if not exists iros_confirmations_company_idx on public.iros_confirmations (company_id, action);

-- Service-role access only — the gateway always scopes by company_id explicitly.
alter table public.iros_integration_tokens enable row level security;
alter table public.iros_confirmations enable row level security;
