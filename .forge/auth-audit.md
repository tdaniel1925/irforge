# Auth / gating / session audit — 2026-06-30

Triggered by: "after logout I still see **Open App** instead of Login," and a request to
audit auth/gating end-to-end.

---

## THE HEADLINE BUG — "Open App" after logout

**It is NOT a session or cookie bug. Logout works.** The marketing nav simply never
checks whether you're signed in.

- `components/marketing/Chrome.tsx:43-51` — `MarketingNav` is a static client component.
  It shows **"Open the app"** (→ `/app`) for everyone whose `audience !== "investors"`,
  and **"Join free"** for investors. There is **no auth check at all** — no `getUser()`,
  no cookie read, no `/api/state` fetch. So the button looks identical whether you're
  logged in or out.
- Logout itself is fine: `components/UserMenu.tsx:29-32` (and `MemberShell.tsx:20-27`)
  call `supabase.auth.signOut()` then `router.push("/")`. The cookie IS cleared.
- So after logout you land on `/`, and the nav still says "Open the app" because that
  text was never conditional. (If you click it while logged out, middleware bounces you
  to `/login` — so it "works," it's just the wrong label and a confusing extra hop.)

**Fix (small, high value):** make the landing nav auth-aware.
- Make `app/page.tsx` (and `/for-companies`, `/for-investors`) read auth server-side
  (`export const dynamic = "force-dynamic"` + `supabase.auth.getUser()` in the server
  page) and pass `signedIn` into `MarketingNav`.
- In `MarketingNav`: `signedIn ? "Open the app" (/app) : "Log in" (/login)` — plus a
  "Log in" text link next to the primary CTA for logged-out visitors.
- This also fixes the footer `/app` "Open the app" link (Chrome.tsx:74).

---

## CRITICAL

### C1. Auth enforcement hinges on a single env var — verify it in PRODUCTION
`middleware.ts:17` — if `AUTH_ENABLED !== "1"` OR `NEXT_PUBLIC_SUPABASE_URL` is unset,
middleware returns `next()` and **all route protection is bypassed** (single-company
demo mode). Locally `AUTH_ENABLED=1` is set. **Action:** confirm `AUTH_ENABLED=1` is set
on Vercel/prod. If it's missing there, every `/app`, `/admin`, `/settings` route is open.
Recommend: treat "SUPABASE_URL set but AUTH_ENABLED!=1" as a hard misconfig in prod.

### C2. `isSuperAdmin()` can throw / has no fail-safe
`lib/platform.ts:20-30` — the `platform_admins` query has no try/catch. A transient
Supabase error propagates: an admin API 500s instead of cleanly 403'ing, and the flag
resolution is unreliable. **Fix:** wrap in try/catch, fail closed (`return false`).
This is also a plausible secondary reason the Admin nav intermittently vanished for you.

### C3. Sidebar swallows `/api/state` failures → Admin nav hidden until reload
`components/Sidebar.tsx:99-107` — the fetch that sets `superAdmin` ends in
`.catch(() => {})`. Any network blip/500 leaves `superAdmin=false` for the whole session,
silently hiding the **Admin** section (your only nav path to Customer Management).
**Fix:** on error, retry once and/or surface an inline "couldn't load menu — refresh"
state instead of failing silent.

---

## MEDIUM

### M1. Middleware doesn't refresh the session token
`middleware.ts:40` calls `getUser()` but never `refreshSession()`. When the access token
expires (refresh token still valid), users can get unexpectedly bounced to `/login`.
The canonical `@supabase/ssr` middleware refreshes. **Fix:** add a refresh, or follow the
documented SSR middleware template exactly.

### M2. `/login` doesn't redirect an already-authenticated user
`app/login/page.tsx` — a logged-in user visiting `/login` sees the sign-in form.
**Fix:** on mount, `getUser()` → if present, redirect to `/app` (company) or `/member`.

### M3. Two APIs return 200 + empty instead of 401 when unauthenticated
`app/api/team/route.ts:6-9` and `app/api/workspace/route.ts` call their lib fns directly;
unauthenticated callers get empty data, not a 401. Harmless today (middleware blocks them
when AUTH_ENABLED=1) but a broken contract if middleware is ever off. **Fix:** explicit
`getMyCompany()` guard → 401.

### M4. Client tier-gate vs server feature-gate can disagree
`components/FeatureGate.tsx` gates on `tierHasFeature(tier, …)`; servers gate on
`companyHasFeature(companyId, …)` (tier OR per-company flag OR comp OR super-admin). A
comped/pro company with a per-feature flag OFF can see a control client-side then get a
403 on click. **Fix:** make the client gate consult the same source (send effective
feature set in `/api/state`) so UI and API agree.

### M5. Impersonation state isn't surfaced in `/api/state`
`app/api/state/route.ts:36-38` returns synthetic `tier:"pro"` while impersonating with no
`impersonating` flag, so the client can't tell real-pro from acting-as, and cached tier
may linger after exit. **Fix:** add `impersonating: boolean` + the acted-as company to
the response; ensure FeatureGate/menus refetch on impersonation start/stop.

---

## LOW

- **L1.** Impersonation cookie (`app/api/admin/impersonate/route.ts:24`) isn't bound to the
  admin who set it; a *different* admin on the same browser could reuse it (still an admin,
  audit-logged — low risk). Consider signing it with `admin_user_id` / shorter maxAge.
- **L2.** `FeatureGate` shows the upgrade wall on a network error (fail-closed but reads as
  "you must pay"). Add an error state distinct from "locked."
- **L3.** No "stop acting as" control inside `/admin/customers` itself (only the app-wide
  ImpersonationBanner). Minor.
- **L4.** `NEXT_PUBLIC_SITE_URL` is unset locally; invite/email links fall back to the
  hardcoded `https://pubcozone.com`. Fine for prod, wrong for local testing of links.

---

## What is CORRECT (so we don't churn it)
- Middleware matcher covers all routes; PUBLIC allowlist is explicit and sensible.
- Protected routes redirect HTML→`/login`, APIs→401 (when AUTH_ENABLED=1).
- Admin APIs each re-check `isSuperAdmin()` (defense-in-depth beyond hidden nav).
- Auth callback (`app/auth/callback/route.ts`) handles PKCE + OTP, no open-redirect.
- RLS: `platform_admins_self`, `is_company_admin`, `my_company_ids` all correct; your
  `tdaniel@botmakers.ai` row is valid (`super_admin=true`, user_id matches).
- Per-company team management (`/team`, `/api/team`) correctly admin-gated via RLS.
