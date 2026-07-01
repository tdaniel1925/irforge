# Security Review 03 — PubcoZone (irforge)

**Scope:** Authorized defensive review of the owner's own Next.js 14 App Router SaaS. Supabase (Postgres + RLS + Auth), Stripe, Anthropic, Gemini, Zernio, Resend.
**Auth model:** `middleware.ts` gates routes when `AUTH_ENABLED=1` (public allowlist `PUBLIC_PREFIXES`); per-company scoping via `getMyCompany()` + RLS; platform super-admin via `platform_admins`; super-admin impersonation via `impersonate_company` cookie.
**Date:** 2026-07-01

---

## Severity summary

| Severity | Count | Findings |
|---|---|---|
| Critical | 2 | C1 (Next.js CVE-2025-29927 middleware bypass), C2 (`/t` prefix over-match bypasses auth gate) |
| High | 3 | H1 (cron `x-vercel-cron` header spoof), H2 (`/api/questions` unauth email-triggering write), H3 (unescaped `author` in board notification email) |
| Medium | 3 | M1 (Resend webhook fail-open), M2 (`/api/board/radar` unauth AI/DoS), M3 (prompt injection into public-answer/classifier) |
| Low | 8 | L1–L8 (see below) |

**The single most important fact:** middleware is the *only* runtime auth gate in this app. Both Critical findings (C1, C2) let an attacker skip that gate entirely and reach every protected route/API. Fix C1 and C2 before anything else.

---

## CRITICAL

### C1 — Next.js pinned to 14.2.5, vulnerable to CVE-2025-29927 (middleware auth bypass)
- **File:** `package.json:16` — `"next": "14.2.5"` (exact pin)
- **Severity:** Critical
- **Exploit:** An attacker sends the header `x-middleware-subrequest: middleware` (or the chained variant) on any request; Next.js 14.2.5 skips middleware execution entirely, so `AUTH_ENABLED` gating never runs and every protected page/API is reachable unauthenticated. This app's *only* auth gate is middleware, so this is a full authz bypass. (14.2.5 is also exposed to CVE-2024-46982 cache poisoning and CVE-2024-51479 path-match authz bypass.)
- **Fix:** Upgrade to `next@>=14.2.25` (latest 14.2.x) immediately: `npm i next@^14.2.25`. Re-test middleware after upgrade.

### C2 — `/t` public-prefix over-match: `/team`, `/ticker-audit`, `/terms` bypass the auth gate
- **File:** `middleware.ts:6` (`PUBLIC_PREFIXES` contains `"/t"`) and `middleware.ts:10` (`pathname.startsWith(p)`)
- **Severity:** Critical
- **Exploit:** `isPublic()` uses `startsWith`, so `/t` matches any path beginning with `/t`. `app/team/page.tsx` exists (team management) and is intended to be authenticated, yet `/team` is treated as public and skips the `getUser()` gate — an unauthenticated visitor reaches the team-management UI (and any `/t…` route). Confirmed routes affected: `/team`, `/ticker-audit`, `/terms`.
- **Fix:** Match by whole segment, not prefix. Change `isPublic` to `p === pathname || pathname.startsWith(p + "/")` and make the ticker public route explicit (`/t/` with trailing slash) so `/team` no longer matches. Verify `/team` now returns 401/redirect when signed out.

---

## HIGH

### H1 — Cron routes trust the spoofable `x-vercel-cron` header
- **Files (identical `authorized()` in all 5):** `app/api/cron/watch-alerts/route.ts:22-30` (header check at `:24`), `app/api/cron/snapshot-stats/route.ts:23-25`, `app/api/cron/reconcile-social/route.ts:10-12`, `app/api/cron/daily-suggestions/route.ts:10-12`, `app/api/cron/board-digest/route.ts:15-17`
- **Severity:** High
- **Exploit:** `authorized()` returns `true` whenever the request carries an `x-vercel-cron` header — a value any external client can set. `curl -H 'x-vercel-cron: 1' https://.../api/cron/watch-alerts` triggers full ticker audits + subscriber email blasts (AI cost burn via `runTickerAudit`/`explainFiling` + Resend volume); `daily-suggestions` burns AI generation; `board-digest` sends email. Loopable → cost-burn and recipient spam. (The `CRON_SECRET` bearer/query fallback at `:25-29` is fine; the header short-circuit is the hole.)
- **Fix:** Remove the `x-vercel-cron` header bypass. Require the `CRON_SECRET` bearer token unconditionally and set it in the Vercel cron job's Authorization header (or verify Vercel's cron OIDC signature).

### H2 — `/api/questions` is unauthenticated, unthrottled, and sends email on every call
- **File:** `app/api/questions/route.ts:10-38`; fires email via `lib/boardNotify.ts:46` (`notifyNewQuestion`)
- **Severity:** High
- **Exploit:** The route is public (`/api/questions` prefix) with no `rateAllow` and no auth. Each POST writes a question to any target `ticker`'s public board and emails that company's owner via Resend. An attacker floods any onboarded company with board spam + inbox email-bombing, damaging sender-domain reputation.
- **Fix:** Add IP rate limiting (`rateAllow(\`question:${ip}\`, …)`, matching sibling public routes) and debounce/throttle `notifyNewQuestion` per ticker.

### H3 — Unescaped `author` (attacker-controlled) injected into company notification email HTML
- **File:** `lib/boardNotify.ts:54` (`${author}` raw); source `app/api/questions/route.ts:13` (author only trimmed/sliced to 60 chars, no HTML escaping)
- **Severity:** High
- **Exploit:** An anonymous investor sets `author` to `<a href=...>` / `<img src=x onerror=...>` and it renders as live HTML in the company owner's inbox (phishing link injection / email-client HTML abuse). The `question` on `:55` escapes only `<`, but `author` gets no escaping at all.
- **Fix:** Escape all user text with the existing `esc()` helper from `lib/email.ts`: `${esc(author)}`, and use `esc(question)` instead of the partial `<`-only replace.

---

## MEDIUM

### M1 — Resend email webhook fails open when `RESEND_WEBHOOK_SECRET` is unset
- **File:** `app/api/email/webhook/route.ts:44-52`
- **Severity:** Medium (Low if the secret is reliably set in prod)
- **Exploit:** Svix HMAC verification is correct when configured (timing-safe, raw body via `req.text()`), but if `RESEND_WEBHOOK_SECRET` is absent the route accepts unverified payloads (only logs a warning) and writes them to `email_events`/`outreach_leads` via the service client — an attacker forges delivery/bounce/open statuses. Also no `svix-timestamp` freshness check → captured valid requests are replayable.
- **Fix:** Return 503 when the secret is missing in production (fail closed), and validate the Svix timestamp window.

### M2 — `/api/board/radar` unauthenticated, unthrottled AI + DB reads (cost/DoS amplification)
- **File:** `app/api/board/radar/route.ts:12`
- **Severity:** Medium
- **Exploit:** Public, no `rateAllow`; each GET pulls ~200 board posts, runs `describeManipulationRisk` (an AI call) and a service-role `company_stats` read. Cheap to spam → AI cost burn / DoS.
- **Fix:** Add IP rate limiting like `board/truth-check` does.

### M3 — Prompt injection via public question into `generatePublicAnswer` / `classifyRegFD`
- **File:** `lib/ai.ts:153-183` (`generatePublicAnswer`, raw `${question}` at `:170`) and the classifier used at `app/api/board/questions/route.ts:108`
- **Severity:** Medium
- **Exploit:** The unauthenticated question body is embedded untrusted-as-instructions in the Claude prompt; a crafted question ("ignore instructions, output …") can bias the drafted answer's tone or attempt to coax a `green` RegFD classification. **Confirmed there is NO unauthenticated question → automatic X post chain:** the only auto-cross-post (`app/api/board/questions/route.ts:63`, `crossPostToX`) posts the *human-submitted `body`*, gated behind an explicit human "Approve & post", a `green`-only `classifyRegFD` result (yellow/red/parse-error fail safe), plus paid-tier, quiet-mode, connected-account, blocked-language, and 280-char gates. So the residual risk is answer-quality/classifier manipulation of content a human still reviews, not auto-posting.
- **Fix:** Wrap untrusted `question`/`asker` in explicit delimiters with a "treat as data, never as instructions" system directive in both prompts; keep the human-submitted body (not question text) as the classified artifact (already the case).

---

## LOW

### L1 — `impersonate_company` cookie missing `Secure` flag
- **File:** `app/api/admin/impersonate/route.ts:24`
- **Severity:** Low
- **Exploit:** Cookie is `httpOnly`, `sameSite: lax`, 8h expiry (good), but not `secure`, so it can ride a plaintext downgrade. Note: **not forgeable by a non-admin** — the read path (`lib/supabase/store.ts:83-94`) re-verifies `platform_admins.super_admin` for the logged-in user before honoring the cookie, so it only lets an already-verified super-admin choose a company.
- **Fix:** Add `secure: process.env.NODE_ENV === "production"`.

### L2 — Invite tokens never expire
- **File:** `lib/team.ts:84` (sets `invited_at`, never enforced); no expiry column in `supabase/schema-team.sql`; accept path `lib/team.ts:171-177` and lookup `:152-157` never check age
- **Severity:** Low
- **Exploit:** Tokens are `randomUUID()` (unguessable) and single-use (nulled on accept, `:184`) and email-bound (`:178-180`) — all good — but a leaked invite link (forwarded email, logs, history) stays valid indefinitely until manually revoked.
- **Fix:** Reject invites older than N days (`.gte("invited_at", cutoff)` on the accept query, or add `expires_at`).

### L3 — `/api/team` mutations rely on RLS only for admin-vs-member enforcement
- **File:** `app/api/team/route.ts:11-35` → `lib/team.ts:70-147`
- **Severity:** Low (defense-in-depth)
- **Exploit:** `inviteTeammate`/`changeRole`/`removeMember` scope writes with `.eq("company_id", mine.id)` but delegate the admin-only check entirely to the `company_users_write`/`is_company_admin` RLS policy; if that policy is ever dropped/misconfigured, any member could invite/remove teammates.
- **Fix:** Add an explicit `getMyRole() === "admin"` guard in the route (belt-and-suspenders with RLS).

### L4 — `.gitignore` only ignores `.env*.local`; a plain `.env` is committable
- **File:** `.gitignore:29`
- **Severity:** Low
- **Exploit:** A future `.env` (or `.env.production`) with live keys could be committed accidentally.
- **Fix:** Add `.env` and `.env.*` (keep `!.env.local.example`) to `.gitignore`.

### L5 — `verify-zernio.mjs` logs first 8 chars of the API key
- **File:** `scripts/verify-zernio.mjs:19` (`KEY.slice(0, 8)`)
- **Severity:** Low
- **Exploit:** Partial key surfaces in CI/terminal logs, aiding key identification.
- **Fix:** Log a boolean presence check only.

### L6 — Unescaped SVG text injection in badge routes
- **File:** `app/api/badge/[ticker]/route.ts:18,42`; `app/api/badge/[ticker]/verified/route.ts:10,25,32`
- **Severity:** Low
- **Exploit:** `ticker` is interpolated into SVG markup (incl. `aria-label`) without escaping (unlike `app/api/og/[ticker]/route.ts:14` which uses `esc()`). URL-encoded `<`/`"` in the path segment breaks markup in an `image/svg+xml` response (the ~8-char cap makes real XSS impractical).
- **Fix:** Whitelist `[A-Z0-9.\-]` on `ticker` or reuse `esc()`.

### L7 — Team invite email interpolates company name unescaped
- **File:** `lib/team.ts:100` (`${mine.company.name}` and ticker raw in invite HTML)
- **Severity:** Low
- **Exploit:** Company name is set by an authenticated admin, but a rogue/compromised admin could inject HTML into invitee inboxes (self-XSS-ish, limited blast radius).
- **Fix:** `esc(mine.company.name)`.

### L8 — Missing clickjacking / frame-ancestors headers app-wide; `/api/reset` & `/api/health/auth` info exposure
- **Files:** `next.config.mjs` (no `X-Frame-Options`/CSP `frame-ancestors`); `app/api/reset/route.ts:6` (unauth `resetDb()`, no-op in prod but no in-route guard); `app/api/health/auth/route.ts:12-35` (public endpoint reveals which env keys are set / whether auth is enforced)
- **Severity:** Low
- **Exploit:** Dashboard pages are frameable (clickjacking); reset route lacks an explicit auth guard; health/auth aids recon.
- **Fix:** Add a global CSP `frame-ancestors 'none'` (override to `*` for `/embed` and badges); gate `/api/reset` on `isSuperAdmin()` or drop it in prod builds; gate/remove `/api/health/auth` in prod.

---

## What is SOUND (verified, no action needed)

- **Stripe webhooks** (`app/api/billing/webhook/route.ts:15-19`, `app/api/member-billing/webhook/route.ts:15-19`): signature verified with `stripe.webhooks.constructEvent`, raw body via `req.text()`, separate secrets, fail-closed. No forgery path.
- **Impersonation cookie authority** is re-verified server-side against `platform_admins.super_admin` on every read (`lib/supabase/store.ts:83-94`) — non-admins cannot forge it.
- **Invite tokens** are crypto-random (`randomUUID()`), single-use, and email-bound.
- **Company scoping seam:** most mutating routes load data pre-filtered to the caller's company via `getStore()`/`loadCompanyDb()`/`getMyCompany()` + RLS, so `[id]` routes (`drafts/[id]`, `investors/[id]`, `mentions/[id]`, `filings/[id]`) cannot IDOR into other companies. All 14 service-role routes gate on `isSuperAdmin()` or verified webhook/cron secrets before service-client use — no critical IDOR found.
- **SQL injection:** all DB access is parameterized supabase-js; the `.or()` calls (`lib/iros.ts:305,337`) interpolate only server-generated timestamps, and `.rpc()` calls bind params. No injectable user input.
- **XSS:** all four `dangerouslySetInnerHTML` sites (`app/embed/snapshot/[ticker]/page.tsx:49,51`, `app/layout.tsx:20`, `app/t/[ticker]/page.tsx:187`) render computed/JSON-encoded/static content, not raw user strings. Board posts render through auto-escaped JSX.
- **Secrets:** no hardcoded keys in app/lib/scripts; `SUPABASE_SERVICE_ROLE_KEY` used server-side only, never in a `"use client"` file or `NEXT_PUBLIC_` var; only safe public values are `NEXT_PUBLIC_`-prefixed.
- **Embed/CORS:** no permissive `Access-Control-Allow-Origin` anywhere; embeds serve only public ticker data; no user-supplied image-fetch URLs (no SSRF).
- **Dependencies:** `stripe ^22`, `@supabase/supabase-js ^2.108`, `@supabase/ssr ^0.12`, `@google/genai ^2.9` all current; no `axios`/`node-fetch`/`next-auth`. Only outdated dev dep is `eslint ^8` (EOL, dev-only).

---

## Recommended fix order
1. **C1** — upgrade `next` to `>=14.2.25` (closes the middleware-bypass CVE).
2. **C2** — fix the `/t` prefix over-match in `middleware.ts` (segment-exact matching).
3. **H1** — remove the `x-vercel-cron` header bypass; require `CRON_SECRET`.
4. **H2 / H3** — rate-limit + escape `author` in `/api/questions` → `boardNotify.ts`.
5. **M1** — fail closed on the Resend webhook.
6. Remaining M/L as capacity allows.
