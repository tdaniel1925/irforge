-- Outbound signed events: PubcoZone → an external control plane (Jordyn).
-- Additive + idempotent. Run once in the Supabase SQL editor.
--
-- A connected client registers a callback URL + secret per company (via the
-- gateway tool register_event_callback). When an investor question lands on the
-- board, PubcoZone POSTs a signed payload to that URL. The `enabled` flag is the
-- notification on/off switch (toggled from PubcoZone's UI, Jordyn's UI, or chat).

create table if not exists public.iros_event_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  callback_url  text not null,
  secret_hash   text not null default '',   -- sha256 of the signing secret (cheap equality checks)
  secret_enc    text not null default '',   -- AES-256-GCM of the signing secret (used to sign outbound)
  enabled       boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (company_id, callback_url)
);
create index if not exists iros_event_subscriptions_company_idx on public.iros_event_subscriptions (company_id);

-- Delivery log — for retry accounting + an audit trail of what was pushed where.
create table if not exists public.iros_event_deliveries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  event_id      text not null,
  event_type    text not null,
  callback_url  text not null,
  status        text not null default 'pending',  -- pending | delivered | failed
  attempts      int not null default 0,
  last_error    text default '',
  created_at    timestamptz default now(),
  delivered_at  timestamptz
);
create index if not exists iros_event_deliveries_event_idx on public.iros_event_deliveries (event_id);

-- Service-role only.
alter table public.iros_event_subscriptions enable row level security;
alter table public.iros_event_deliveries enable row level security;
