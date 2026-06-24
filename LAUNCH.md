# PubcoZone — Launch Checklist

Status as of the last automated check. Work top-to-bottom. The 🔴 items are the
hard gate — do not take real customers/payments until all three are done.

---

## 🔴 Must-do before real customers (the gate)

- [ ] **Rotate every exposed secret.** These were pasted in chat/screenshots and
      must be regenerated, then re-pushed to Vercel:
  - Stripe **live** secret key (`sk_live_…`) → Stripe → Developers → API keys → Roll
  - Stripe **restricted** key (`rk_live_…`) → roll or revoke
  - Supabase **service_role** key → Supabase → Settings → API → "Reset" (⚠️ also update anywhere else it's used)
  - Anthropic, Resend, Ayrshare (key + private key), OpenAI, Gemini, Microsoft client secret
  - After rotating: `vercel env rm <KEY> production` then `vercel env add <KEY> production`, then redeploy.
- [ ] **Run `supabase/fix-audit-delete.sql`** in the Supabase SQL editor
      (deleting a company currently 500s without it).
- [ ] **Put one real payment through** (or a Stripe test-clock subscription) and
      confirm the account flips to `active`. Watch Stripe → Webhooks → delivery log for a 200.

---

## 🟠 Verify before launch

- [ ] **Email delivery works (two separate systems).**
  - **App email** (team invites, welcome, alerts, lead outreach) already runs on
    Resend via `lib/email.ts` (`RESEND_API_KEY` + `EMAIL_FROM=…@pubcozone.com`).
    Nothing to change — `pubcozone.com` is verified in Resend.
  - **Auth email** (signup confirmation, password reset, magic link) is sent by
    **Supabase**, not our code — by default via Supabase's throttled built-in SMTP
    (~3–4/hr, spam-prone). **Route it through Resend too** so all email is one
    provider: Supabase → Project Settings → Authentication → **SMTP Settings →
    Enable Custom SMTP**:
    - Host `smtp.resend.com` · Port `587` · Username `resend` ·
      Password = the `RESEND_API_KEY` · Sender `alerts@pubcozone.com` ·
      Sender name `PubcoZone`.
  - Then Supabase → Auth → **URL Configuration**: Site URL `https://pubcozone.com`
    and add Redirect URL `https://pubcozone.com/auth/callback` (the route that
    turns the email link into a session; also `http://localhost:3000/auth/callback`
    for dev).
  - **Test:** do one real signup → confirm the email arrives from `@pubcozone.com`
    and the link logs you in (lands on `/member` for investors).
  - If you'd rather skip email for now: Supabase → Auth → Providers → Email →
    uncheck **Confirm email** → investors sign up instantly, no email dependency.
  - ⚠️ The `RESEND_API_KEY` was pasted in chat during setup — **rotate it** in
    Resend (Settings → API Keys), then update `.env.local` + Vercel.
- [ ] **Stripe live webhooks** point at:
  - `https://pubcozone.com/api/billing/webhook` (company)
  - `https://pubcozone.com/api/member-billing/webhook` (member)
  - Each with: `checkout.session.completed`, `customer.subscription.updated`,
    `customer.subscription.deleted`, `invoice.payment_failed`. (Secrets already in Vercel.)
- [ ] **Decide: charge real money now, or soft-launch?** Stripe is in LIVE mode.
- [ ] **Two-tenant spot check** — confirmed automatically for new systems (CRM,
      IR-OS, members); do a quick manual check that two real companies never see
      each other's legacy-tool data (studio/filings/documents/captable).

---

## ✅ Already done / verified

- All migrations run on production (24 tables present + RLS).
- `tdaniel@botmakers.ai` is super admin with all features unlocked.
- Multi-tenant **RLS verified live** — a company sees only its own data.
- `audit_log` is append-only + tamper-evident.
- Compliance core works end-to-end (Reg FD classifier → counsel sign-off, one click).
- Full UX audit's blockers + majors fixed.
- Stripe webhooks reach handlers and validate signatures (return 400 to unsigned).
- All env vars present on Vercel: Supabase ×3, Stripe ×9, Anthropic, Resend,
  EMAIL_FROM, CRON_SECRET, AUTH_ENABLED, Ayrshare.
- Builds clean, deployed, serving 200s.
- Cron registered (`vercel.json`) for watch alerts.

---

## Ongoing / nice-to-have

- Server-side tier enforcement on remaining legacy tool API routes (client
  FeatureGate now fails closed; server checks exist on the IR-OS/CRM routes).
- Lawyer review of the Privacy / Terms / "How it's legal" pages.
- Custom OG/share images verified rendering on a live X/LinkedIn share.
- **Clean up pre-fix Ayrshare profiles by hand.** Profiles created before the
  `ayrshare_profile_key` persistence fix (PR #1) never had their `profileKey`
  saved. Ayrshare's delete API requires the `profileKey` (returned only at
  create time) — the listing API exposes only `refId`, which it won't accept —
  so these old profiles **cannot be deleted from code or the API**. Delete the
  stale/test ones manually in the Ayrshare dashboard (app.ayrshare.com → User
  Profiles). Profiles created after the fix store their key and are deletable
  normally.

---

## Quick reference — prod URLs

- App: https://pubcozone.com
- Vercel project: bot-makers/irforge
- Supabase: SQL editor for migrations; Auth → Providers for email-confirm toggle
- Stripe: Developers → Webhooks / API keys (LIVE mode)
