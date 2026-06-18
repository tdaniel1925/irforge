-- Promo/comp companies are created BEFORE anyone owns them (the invitee becomes
-- admin on accept-invite). Access is governed by company_users membership now, so
-- owner_id is optional. Drop the NOT NULL so an ownerless company shell can exist.
alter table public.companies alter column owner_id drop not null;
