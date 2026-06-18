-- Email delivery log. One row per email we send; the Resend webhook updates the
-- status (delivered / bounced / opened / complained) with timestamps.
create table if not exists public.email_events (
  id            uuid primary key default gen_random_uuid(),
  message_id    text,                       -- Resend's email id (for webhook matching)
  to_email      text not null default '',
  kind          text not null default '',   -- 'promo_invite' | 'team_invite' | 'welcome' | ...
  subject       text default '',
  status        text not null default 'sent', -- sent | delivered | bounced | opened | complained | failed
  sent_at       timestamptz default now(),
  delivered_at  timestamptz,
  opened_at     timestamptz,
  error         text default ''
);
create index if not exists email_events_message_idx on public.email_events (message_id);
create index if not exists email_events_to_idx on public.email_events (lower(to_email), sent_at desc);

-- Read is super-admin only (it's an ops log); writes happen via the service role.
alter table public.email_events enable row level security;
drop policy if exists email_events_admin_read on public.email_events;
create policy email_events_admin_read on public.email_events for select
  using (public.is_super_admin());
