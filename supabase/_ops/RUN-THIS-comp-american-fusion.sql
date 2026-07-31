-- Comp American Fusion (admin dd@americanfusionenergy.com) — free full access.
--
-- "Comped" = subscription_status 'active' with NO stripe_subscription_id behind
-- it. The app treats such a company as a full-access customer: rowToCompany sets
-- comped=true, /api/state reports tier 'pro' (opens FeatureGate), and
-- companyHasFeature() returns true for every feature. So this one row update
-- unlocks every tool for them, with no effect on any other company.
--
-- Run once in the Supabase SQL editor. Idempotent.

update public.companies c
set subscription_status = 'active',
    stripe_subscription_id = null
from auth.users u
where c.owner_id = u.id
  and lower(u.email) = lower('dd@americanfusionenergy.com');

-- Verify: should return the company with subscription_status='active' and a null
-- stripe_subscription_id (= comped).
select c.name, c.ticker, c.subscription_status, c.stripe_subscription_id
from public.companies c
join auth.users u on u.id = c.owner_id
where lower(u.email) = lower('dd@americanfusionenergy.com');
