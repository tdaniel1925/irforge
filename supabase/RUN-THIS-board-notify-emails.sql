-- Board notification recipients: the email addresses that get notified when an
-- investor posts a QUESTION to the company's discussion board (immediate) and in the
-- daily digest. Empty/null falls back to the company owner's account email.
-- Safe to run multiple times.

alter table public.companies
  add column if not exists board_notify_emails text[] not null default '{}';
