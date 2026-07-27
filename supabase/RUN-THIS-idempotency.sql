-- Idempotency keys for side-effectful service operations (publish, schedule —
-- later: charge, send). Additive + idempotent. Run once in the Supabase SQL editor.
--
-- A caller supplies an idempotency key with a mutating request; the service
-- claims (company_id, operation, key) BEFORE executing. A retry with the same
-- key returns the stored result instead of re-running the side effect. Keys are
-- per-company so one tenant can never collide with (or probe) another's keys.

create table if not exists public.iros_idempotency (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  operation    text not null,
  idem_key     text not null,
  status       text not null default 'running',   -- running | done
  result       jsonb,                              -- stored operation result once done
  request_id   text default '',                    -- correlation id of the first attempt
  created_at   timestamptz default now(),
  finished_at  timestamptz,
  unique (company_id, operation, idem_key)
);

create index if not exists iros_idempotency_created_idx on public.iros_idempotency (created_at);

-- Service-role access only (the service layer always scopes by company_id
-- explicitly). No anon/user policies: this table is invisible to browsers.
alter table public.iros_idempotency enable row level security;
