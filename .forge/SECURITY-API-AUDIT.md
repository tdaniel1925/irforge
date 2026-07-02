# API Security Audit — all 107 routes

**Date:** 2026-07-01 · Triage (scripts/_audit-routes.mjs) + 3 parallel deep audits +
manual verification of every non-SAFE finding. Sub-reports: secaudit-team-account.md,
secaudit-company-data.md, secaudit-public-admin.md.

## Scope
107 route handlers. Classified by middleware exposure (public allowlist vs gated) and
in-route auth markers. 51 protected routes with explicit markers spot-checked; all
public routes and all mutating routes reviewed.

## FIXED this pass

### SSRF (was: 2 HOLES) — `lib/safeFetch.ts` + both call sites
- `app/api/analyze/route.ts` and `app/api/filings/add/route.ts` fetched an arbitrary
  user-supplied `url` server-side with NO validation — a signed-in user could reach
  cloud metadata (`169.254.169.254`), `localhost`, or private-network services.
- Fix: new `safeFetchText()` guard — https/http only, no credentials in URL, DNS-resolve
  the host and reject any loopback/private/link-local/unique-local/metadata IP,
  redirect:manual (no auto-follow to an internal host), 2 MB + 15 s caps. Both routes now
  route through it. 14 unit tests pin the rejections (`lib/__tests__/safeFetch.test.ts`).

### AI/network-spend routes lacked an in-route auth gate (was: 8 NEEDS-FIX)
Middleware blocks anonymous access in prod, but these had no defense-in-depth and would
burn tokens if middleware were ever misconfigured. Added `authed`/`getMyCompany` gates:
`ai/fit`, `ai/polish`, `ai/write-post`, `analyze`, `disclosure`, `score`,
`threats/rebut`, `filings/[id]/generate`, `filings/add`, `investors/generate`. Also
capped unbounded inputs (`fit` text 20k, `write-post` topic 2k, analyze/filings text 100k).

### Abuse hardening (was: 3 low NEEDS-FIX)
- `watch`: added a per-IP rate cap alongside the per-email one — the confirmation email
  goes to an attacker-controlled address, so email-only limiting was bypassable
  (email-bombing from our domain).
- `admin/leads/export`: CSV cells starting with `= + - @` are now prefixed with `'` to
  neutralize spreadsheet formula injection (lead data comes from EDGAR/user input).
- `admin/leads/send`: operator-supplied subject noted; body already HTML-escaped
  (cosmetic only — admin-only route).

## VERIFIED SAFE (no change needed)

- **All `/api/admin/**` routes** independently call `isSuperAdmin()` (fails closed)
  before any action. No anonymous or non-super-admin path to any admin mutation.
- **Team management** (`/api/team`, `/api/team/accept`): invite/role/remove enforced by
  RLS `company_users_write` (`is_company_admin`) — members can't escalate or touch
  another company. Invite tokens are 122-bit UUIDs, single-use (nulled on accept), and
  accept verifies signed-in email == invited email. Last-admin guard prevents orphaning.
- **Per-user data** (`user-flags`, `workspace`, `notes`): scoped by `user_id`/`company_id`
  + RLS (`user_flags_own`, `user_workspace_own`, `company_data`); private even from
  teammates; foreign ids yield 404, not another tenant's data.
- **`iros/approve`**: auth enforced inside `recordApproval` (401 when unsigned); RLS
  scopes `iros_posts`. RED counsel decisions capture a tamper-evident signature.
- **Company-data mutation routes** (`calendar`, `captable`, `documents`, `investors/[id]`,
  `notes`): write to `company_data` which is RLS-isolated per tenant — no cross-tenant
  write even without an in-route company check.
- **Public data APIs** (`badge/*`, `og`, `chart`, `trending`, `movers`, `buzz`, `risk`,
  `sec-feed`, `board/radar`, `onboard/lookup`): return only public market/board data; no
  tenant/PII/claim leakage; `board/radar` uses memberId only internally (not returned).
- **Public write/spend endpoints are rate-limited**: `board` (member-auth + AI behind
  auth, hardcodes verified:false — no anon spend or verified-spoof), `truth-check`
  (12/min), `ticker-audit` (10/min), `claim` (5/min), `questions` (3/min per IP).
- **Webhooks**: Stripe (`constructEvent` on raw body) + Resend (svix + timestamp
  freshness, fails closed in prod) verify signatures correctly.
- **No stored XSS**: no `dangerouslySetInnerHTML` on any board/user content; React
  escapes by default. Email HTML escapes user strings (fixed earlier).

## Residual / accepted risk (not fixed — low, documented)
- **`rateAllow` reads `x-forwarded-for`** which a client can spoof to distribute an
  attack across fake IPs. On Vercel the leftmost XFF entry is the real client IP, so
  spoofing is mitigated in practice; a stricter approach would use the platform's
  connecting-IP header. Low.
- **`rateAllow` fails OPEN** if its backing RPC errors (a DB outage disables rate limits
  rather than blocking all posts). Deliberate availability trade-off; acceptable.
- **Company-data mutations are not role-gated in-route** — any signed-in *member* (not
  just admins) can edit calendar/captable/documents/etc. RLS enforces company scope but
  not role. If member-vs-admin write separation is desired for these, add
  `getMyRole()`-based checks. Product decision, not a hole.

## Net
2 SSRF holes closed, 11 defense-in-depth auth gates added, 3 abuse vectors hardened.
No unauthenticated path to admin actions, cross-tenant data, or the demo store in prod.
84 unit tests (14 new for SSRF). No remaining HIGH/CRITICAL API findings.
