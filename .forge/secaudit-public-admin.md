# Security Audit — Public + Admin API routes

Scope: authorized defensive review of owner's own Next.js app (`irforge`).
Auth gate: `lib/platform.ts:20` `isSuperAdmin()` — reads `platform_admins.super_admin` for the current Supabase auth user, **fails closed** on any error (returns false). Solid.
Rate limiter: `lib/publicStats.ts:301` `rateAllow(key, maxPerMinute)` — 1-minute fixed-window counter via Supabase `rate_check` RPC, **fails open** on infra error (line 310) — deliberate availability tradeoff, but means a forced RPC error defeats limits.

Summary: SAFE 20 · NEEDS-FIX 3 · HOLE 0

---

## GROUP A — PUBLIC routes

### SVG / OG generators (read-only, cached, public data)

- **app/api/badge/[ticker]/route.ts** — VERDICT: SAFE (minor). Public grade badge SVG from `getPublicTickerAudit`. Ticker uppercased + `.slice(0,8)` but **not HTML-escaped** before interpolation into SVG (line 42-44). Grade/score come from a fixed hex map / numbers. A ticker containing `<`/`>` would inject into the SVG served as `image/svg+xml`, but the route is embedded via `<img>` (SVG-in-img cannot execute script), and Next constrains the dynamic segment. Low risk; recommend `esc()` for consistency.
- **app/api/badge/[ticker]/price/route.ts** — SAFE. Same pattern; numeric price/change only, ticker unescaped (same low-risk note).
- **app/api/badge/[ticker]/verified/route.ts** — SAFE. Reads `companies` (only `id`, `onboarding_complete`) via service client to decide claimed/not. No leak — boolean only.
- **app/api/og/[ticker]/route.ts** — SAFE. Escapes ticker + companyName via `esc()` (line 14-16, 91-92). Public audit data only, cached.
- **app/api/promo/[ticker]/route.ts** — SAFE. Escapes sub/name (line 6-8, 45-46). Only leaks the public company NAME (already public via audit) — no promo/comp/billing info, no enumeration risk beyond "does this ticker resolve a name" which is already public. **No rate limit**, but it is a pure cached SVG with no spend/DB write. Acceptable.

### Public market data (read-only, cached)

- **app/api/chart/[ticker]/route.ts** — SAFE. Proxies Yahoo Finance, `encodeURIComponent(ticker)`, 9s timeout, cached. No auth data. (No rate limit; proxies an external free API — consider a light IP cap to avoid being an open proxy, but low priority.)
- **app/api/trending/route.ts** — SAFE. No input, cached 600s.
- **app/api/movers/route.ts** — SAFE. No input, cached 300s.
- **app/api/buzz/route.ts** — SAFE. No input, cached 600s.
- **app/api/risk/route.ts** — SAFE. No input, cached 300s.
- **app/api/sec-feed/route.ts** — SAFE. Fetches SEC RSS, revalidate 3600, regex-parsed to title/link/date. Rendered where? Consumed by Learn library; values are React-escaped. No injection.

### Writes / spend (must be rate-limited)

- **app/api/board/route.ts** — VERDICT: SAFE.
  - GET: paginated public board, read-only.
  - POST (post): **requires signed-in member** (`getMyMember`, line 40-43) — client can no longer spoof author; `verified` is **hardcoded false** (line 74), so an anonymous/non-verified user CANNOT post as verified. Rate-limited per member `board:${me.id}` 5/min (line 46). AI moderation (`moderateBoardPost`, spend) runs only AFTER member-auth + rate-limit gate — no anon AI spend.
  - POST (react): the ONE unauthenticated write. Increments reaction counters, IP rate-limited `react:${ip}` 60/min (line 30). Abuse = vote-count inflation via IP rotation / X-Forwarded-For spoofing; low impact (cosmetic counters), no spend, no data leak.
  - Body is NOT rendered with `dangerouslySetInnerHTML` anywhere (MessageBoard.tsx renders `{body}` as text — React auto-escapes). **No stored XSS.**
- **app/api/board/truth-check/route.ts** — SAFE. Anonymous but AI+audit spend is rate-limited HARD `truthcheck:${ip}` 12/min (line 19). Input capped (ticker 8, body 600). IP limit is XFF-spoofable + rateAllow fails open — see NEEDS-FIX note.
- **app/api/ticker-audit/route.ts** — SAFE. Anonymous full audit (external API fan-out), rate-limited `audit:${ip}` 10/min (line 10), ticker regex-validated. Same IP/fail-open caveat.
- **app/api/watch/route.ts** — VERDICT: NEEDS-FIX (low). POST sends a confirmation email (`sendWatchConfirmation`) to the submitted address. Rate-limited per **email** `watch:${email}` 10/min (line 35) — but the limit key is the attacker-controlled email, so rotating target emails lets an attacker send one confirmation email to each of many arbitrary addresses (email-bombing / using your domain to spam). Only 1 email per unique (email,ticker) and only on first watch, which bounds it, but there is no IP-level cap. Recommend adding an `watch:ip` cap alongside the per-email cap. DELETE is member-gated (line 53-54). SAFE otherwise.
- **app/api/claim/route.ts** — SAFE. Rate-limited `claim:${ip}` 5/min (line 9), inputs length-capped + email-validated, writes a lead row + audit. No email sent to the submitted address (internal capture only) so no email-bomb vector. No enumeration (always returns ok:true).

---

## GROUP B — ADMIN routes (must be super-admin gated)

Defense in depth: **app/admin/layout.tsx:12** redirects non-super-admins away from every admin PAGE; every admin API route ALSO checks `isSuperAdmin()` itself (correct — pages and APIs are independently reachable).

- **app/api/admin/route.ts** — SAFE. GET (line 11) and PATCH (line 44) both `isSuperAdmin()`-gated before any service-role query/update. No bypass.
- **app/api/admin/customer/route.ts** — SAFE. `requireAdmin()` (line 13) returns null → 403 for non-admins; GET (line 27-28) and POST (line 44-45) both check `!svc` before any Stripe/DB action. All money actions (create_customer, send_subscription_invoice, charge_setup_fee, cancel_sub, comp, comp_full, promo_invite → sends email) are behind the gate. No unauthenticated spend/escalation.
- **app/api/admin/customers/route.ts** — SAFE. `guard()` (line 8) gates GET (line 15) and POST (line 31) before archive/delete. Delete requires typed-name confirmation (line 49). No bypass.
- **app/api/admin/features/route.ts** — SAFE. GET (line 9) and POST (line 16) both `isSuperAdmin()`-gated. Feature key validated against `IROS_FEATURES` allowlist (line 23). Writes audit. A non-super-admin CANNOT toggle another company's features.
- **app/api/admin/impersonate/route.ts** — SAFE. POST/DELETE/GET all `isSuperAdmin()`-gated (lines 14, 31, 42). Impersonation cookie is `httpOnly`, and `getMyCompany()` honors it ONLY for super admins (per comment) — a forged `impersonate_company` cookie from a non-admin is ignored. Confirm the cookie-honoring code path re-checks super-admin (it does per design). Writes audit.
- **app/api/admin/leads/route.ts** — SAFE. `guard()` gates GET (line 16) and POST (line 41). EDGAR pull limit clamped to 100 (line 56). No bypass.
- **app/api/admin/leads/send/route.ts** — VERDICT: NEEDS-FIX (low, hardening). `isSuperAdmin()`-gated (line 35). Global 24h send cap `DAILY_CAP=25` (line 47-51) protects domain reputation. `renderBody` HTML-escapes the template (line 26) — good, no HTML injection into outreach emails. NOTE: since only an authenticated super-admin can reach it this is not an anon vector; the finding is that email `subject` and `template` are operator-supplied and largely trusted (fine for a single-operator tool). No action strictly required.
- **app/api/admin/leads/export/route.ts** — VERDICT: NEEDS-FIX (low). `isSuperAdmin()`-gated (line 11). CSV cells are quote-escaped (line 19) but NOT protected against **CSV formula injection** — a lead field beginning with `=`/`+`/`-`/`@` (e.g. an EDGAR-sourced company name) would execute as a formula if the admin opens the CSV in Excel. Since lead data is externally sourced (EDGAR/user-editable `contact_name`,`notes`), prefix such cells with `'`. Low severity (admin-only, local spreadsheet), but worth fixing.

---

## Cross-cutting notes

1. **IP-based rate limits (truth-check, ticker-audit, claim, board-react)** derive the client IP from `x-forwarded-for` first hop (`clientIp`). If the hosting edge does not strip/overwrite inbound XFF, an attacker can rotate the header to bypass every IP limit. Verify the platform (Vercel/host) sets a trusted client-IP header and that these routes read THAT. Combined with `rateAllow` failing open on RPC error, the spend-bearing anon routes (AI truth-check, full audit) are the highest-value abuse targets — but each AI/audit call is bounded and there is no privilege/data-leak exposure.
2. **No user/board content is rendered with `dangerouslySetInnerHTML`.** The only uses are (a) JSON-LD in `app/t/[ticker]/page.tsx:187` and (b) internally-generated spark/stat HTML in `app/embed/snapshot/[ticker]/page.tsx:49-55` and `app/layout.tsx` — none interpolate raw user/board input. No stored XSS.
3. **Anonymous → /api/admin mutation: NOT possible.** Every admin route independently calls `isSuperAdmin()` before any action; the check fails closed. No bypass found.
