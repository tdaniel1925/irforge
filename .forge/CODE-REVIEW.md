# PubcoZone / IRForge — Full Codebase Review

**Date:** 2026-07-01 · **Reviewer:** senior-staff-engineer pass (4 parallel deep audits + synthesis)
**App:** AI investor-relations SaaS for public companies + public investor message board.
**Stack:** Next.js 14 App Router / TypeScript / Tailwind · Supabase (Postgres+RLS+Auth+Realtime+Storage) · Stripe · Anthropic Claude · Google Gemini · Zernio (social publishing) · Resend · Vercel (hosting + crons).

Detailed sub-reports (all findings with file:line evidence):
`review-01-architecture.md` · `review-02-bugs.md` · `review-03-security.md` · `review-04-perf-quality-testing.md`

---

## 1. Architecture & structure

**The big picture (diagram in words):** Every request hits `middleware.ts`, which refreshes the Supabase session and gates non-public routes when `AUTH_ENABLED=1`. Pages render inside `components/AppFrame.tsx` (left nav + top bar + right comms rail + tier `FeatureGate`). Server pages and `app/api/**` route handlers resolve the tenant via `getMyCompany()` (RLS-scoped session client; super-admins can impersonate via a server-verified cookie), then read/write one of **two data stores**: (a) the multi-tenant Supabase store (`lib/supabase/store.ts` — `company_data` JSONB collections + first-class tables like `iros_posts`, `public_board`, `company_users`) or (b) a **local JSON demo store** (`lib/db.ts` — `db.drafts`, `db.publicQuestions`, etc.). Outbound flows fan out to services: text AI (`lib/ai.ts` → Claude), images (`lib/image.ts` → Gemini → Supabase Storage), social publishing (`lib/ayrshare.ts` → Zernio), email (`lib/email.ts` → Resend), billing (Stripe + webhooks), and Vercel crons (watch-alerts, daily-suggestions, board-digest, reconcile-social, snapshot-stats). Compliance is a distinct layer (`lib/compliance.ts` + `classifyRegFD`) invoked by every publish path.

**Where it's clean:** the compliance layer is genuine defense-in-depth (regex + AI merged; RED forces counsel sign-off with a SHA-256-signed, audit-logged record; quiet periods gate approval, scheduling, and slot creation). RLS does real authorization work (`company_users`, `iros_posts`, `platform_admins` policies are correct and were verified). Service-role usage is isolated to server-side lib code. Middleware session handling is disciplined (refreshed cookies carried onto 401/redirect responses; fail-closed admin checks).

**Where it's tangled (the defining problem):** the **dual-store split**. The demo JSON store still powers shipped features (`/do` queue, `db.drafts` counts on `/company` and `/proof`, `publicQuestions` drafting) while the real product runs on Supabase — so production screens can show demo-derived numbers, and two approval pipelines exist with different rules (`app/api/drafts/[id]` resets edited drafts to pending; `app/api/iros/posts` does not — see finding B4). Similarly there are **two post pipelines** (`lib/iros.ts` vs `lib/social/calendar.ts`) with **divergent disclosure behavior**: Quick Post uses `buildChannelPost` (channel-aware, compact FLS on X) while `scheduleApprovedPosts` appends full FLS+disclosure ignoring channel limits (High — same product promise, different output depending on path). The `iros` state machine (`canTransition`) is enforced in only one route, and daily suggestions insert a status ("pending") the machine doesn't know.

| Finding | Severity | Fix |
|---|---|---|
| `company_data` save() is full-document last-writer-wins: every `getStore()` route loads all 16 JSONB collections and upserts all 16 back — two concurrent teammates silently clobber each other's unrelated writes (`lib/supabase/store.ts`) | **Critical** | Dirty-key tracking (upsert only touched collections) or split collections into rows with per-row updates; add `updated_at` optimistic check |
| `AUTH_ENABLED` is default-open: missing env (e.g. preview deploys) ships an open app in demo mode (`middleware.ts:17`) | High | Fail closed when `NEXT_PUBLIC_SUPABASE_URL` is set but `AUTH_ENABLED` isn't `1` |
| `demoSeeds` persists **fabricated posts onto real unclaimed tickers' public boards** — including a fake "pump and dump, management are scammers" accusation and a fake *verified company IR reply* (`lib/publicStats.ts:225-228`). Onboarded companies are now excluded, but any real public company that hasn't claimed still gets fake defamatory content + a fake official statement under its ticker | **High (legal)** | Seed only an explicit demo-ticker allowlist, or label seeds visibly as "sample content", or stop seeding entirely |
| `/api/badge/[ticker]/verified` reads `getDb()` (empty in prod) so every customer's embedded "Verified" badge renders "Claim this page" | High | Use `isTickerClaimed()` against Supabase |
| Disclosure divergence between publish paths (above) | High | Route all outbound text through `buildChannelPost` |

## 2. Code quality

Mostly consistent and readable: conventions are documented in-file, naming drift is *commented* rather than silent (the `ayrshare.ts` wrapper explains it now fronts Zernio; `/proof` explains it's labeled "Results"), strict TS is on, and the design-token system is used consistently (SocialEngine was the outlier and was recently fixed). Issues: **duplication** — `components/TeamManager.tsx` still has a near-identical dead twin in the old admin page history; QuickPostComposer/EditorialBoard/SocialEngine each hand-roll the same fetch/busy/error pattern; every cron re-implements the same `authorized()`; every script in `scripts/*.mjs` re-parses `.env.local`. **Dead/legacy surface** — 12+ redirect-stub pages (`/do`, `/approvals`, `/studio`, `/social/*`, `/calendar-os`, `/mentions`, `/metrics`…), demo-store features still shipped behind them, and unused exports (`buildBackgroundPrompt` in `lib/image.ts`). **Type rigor** — repeated `as never` / `as Record<string, unknown>` casts at the ComposeShell and store boundaries launder types the compiler should check. **API consistency** — error shapes are mostly `{error}` but a few routes return raw 500s on malformed JSON (`app/api/drafts/[id]/route.ts:17`). Severity: Medium in aggregate; none of it is rot, but it will compound.

## 3. Bugs & correctness (top items — full list in review-02)

| # | Finding | Severity |
|---|---|---|
| B4 | **Edit-after-approval bypasses the Reg FD gate**: PATCH `iros/posts` updates body on approved posts without resetting status/classification; publish only checks status (`app/api/iros/posts/route.ts:57-64`) | **High** (breaks the core compliance promise) |
| B1/B2 | **$3,500 brief payment black hole**: fulfillment failure → order marked `paid`, webhook ACKs 200, nothing ever retries (`lib/briefs.ts:101-105`); order-row insert failure swallowed pre-payment (`app/api/brief/checkout/route.ts:42`) | **High** (paying customer gets nothing) |
| B3 | Unauthenticated `/api/social/connect` POST consumes Zernio profile slots → plan cap exhaustion DoS on paying customers | **High** |
| B5 | CommsSidebar unread badge is dead code — stale-closure `open` in the polling/realtime `load`; the `openRef` written to fix it is never used (`components/CommsSidebar.tsx:53-55`) | High |
| B6 | EditorialBoard `classify`/`publish`/`approve` use stale `posts` closures + `!` assertion — racing a drag snaps cards back or throws (`components/EditorialBoard.tsx:125,145,156`) | High |
| B7/B8 | Stripe webhook DB writes unchecked (paid-but-inactive customers, no retry); `inv.subscription` field moved on newer Stripe API versions so `past_due` may never set | Medium |
| B15/B16 | BoardQA: sticky error permanently replaces the Q&A list; 4s grace window re-enables Approve → duplicate verified replies | Medium |
| B10/B11/B12 | Unauthenticated AI-spend routes (token burn); unauthenticated destructive `/api/reset`; IDOR on account-health probe (cross-tenant token metadata) | Medium |
| — | Board digest 24h window can double-send or miss around cron drift; `boardActivitySince`/`fetchBoard` truncate at 2000 rows for busy boards; reaction updates are read-modify-write races on a JSON column | Medium/Low |

## 4. Security

**Sound (verified):** Stripe webhook signature verification against the raw body; SQL fully parameterized via supabase-js; no `dangerouslySetInnerHTML`; secrets read from env (none committed; scripts read `.env.local` locally); invite tokens are `randomUUID` single-use with email-match on accept; impersonation cookie is httpOnly and re-verified server-side against `platform_admins` on every use; the auto-post-to-X chain has no viable prompt-injection path to publication (human approval + green-only + blocked-language recheck on the final text).

| # | Finding | Severity |
|---|---|---|
| S1 | **Next.js 14.2.5 is vulnerable to CVE-2025-29927** (`x-middleware-subrequest` header bypasses middleware). Middleware is the *only* gate for many pages, so one header opens every protected route (`package.json`) | **Critical** — upgrade to ≥14.2.25 |
| S2 | **`PUBLIC_PREFIXES` "/t" matches by `startsWith`** — `/team` (team management), `/ticker-audit`, `/terms` silently skip the auth gate (`middleware.ts:6,10`). `/team`'s page has its own redirect guard, but the gate is an illusion for that whole prefix | **Critical** — match whole path segments (`/t` and `/t/…` only) |
| S3 | Cron `authorized()` trusts the client-spoofable `x-vercel-cron` header — anyone can trigger email blasts + AI cost burn (`app/api/cron/*/route.ts`) | High — require `CRON_SECRET` only |
| S4 | `/api/questions` is an unauthenticated, unthrottled write that emails the company on every call (board spam + inbox bombing) | High — rate-limit by IP (rateAllow exists) |
| S5 | Attacker-controlled `author` interpolated unescaped into the owner-notification email HTML (`lib/boardNotify.ts:54`); same pattern worth auditing in all `sendEmail` html builders | High — escape all user strings |
| S6 | Resend webhook: accepts-all when secret unset (warn only); no svix timestamp freshness (replayable) | Medium — fail closed in prod, check timestamp |
| S7 | Weekly-summary route relays platform-branded email to arbitrary addresses (`app/api/iros/summary/route.ts:33-43`) | Low-Med — restrict to teammates |

## 5. Performance

| # | Finding | Severity |
|---|---|---|
| P1 | **`/api/state` is a firehose called 3-4× per page load** (Sidebar, FeatureGate, FreeTierBanner, useAppState fetch it independently): serializes all 16 company collections to the client, runs ~8-11 DB round trips (isSuperAdmin computed twice, getMyCompany three times) **plus a 2000-row `public_board` scan with full bodies just to produce the openQuestions integer** (`lib/board.ts` via `app/api/state`) | **Critical** in aggregate — single context/provider for state; return a trimmed payload; use a `count()` query with a `parent_id`/`flag` filter for openQuestions; memoize isSuperAdmin/getMyCompany per request |
| P2 | N+1: `lib/team.ts:54` calls `auth.admin.getUserById` per member sequentially; CRM import does up to 5,000 sequential upserts; board-digest & watch-alerts crons loop every company/ticker sequentially with no batching or time budget (digest will exceed maxDuration past a few hundred companies) | High — batch/parallelize with `Promise.all` chunks; bulk upserts |
| P3 | Hot public endpoints are actually well-cached (chart/trending/badge/og) — good; board pagination fetches 4000 rows and slices in JS (`lib/publicStats.ts:236`) | Medium — push offset/limit into the query |

## 6. Testing

**There are zero tests.** No test files, no runner config, no `test` script in `package.json` — for a product whose promise is *compliance-gated publishing*. This is the single largest risk multiplier: the compliance regexes, publish gates, and disclosure builders can silently regress with no safety net (the disclosure-divergence bug in §1 is exactly the class of bug tests catch). **Start here (highest value, pure functions, no mocking needed):** (1) `lib/compliance.ts` — `checkContent` blocked-phrase table, `publishGate` matrix (quiet mode / status / flags), `buildChannelPost` per-channel disclosure + 280 cap; (2) `lib/board.ts` — answered/open question logic; (3) `fitToLimit` result-length invariant; (4) middleware `isPublic()` allowlist (would have caught S2); (5) `canTransition` state machine. Then API-level tests for the Reg FD edit-after-approval path (B4).

## 7. Maintainability & tech debt

The three compounding debts: (1) **the dual store** — every new feature must choose a side, and half the team will choose wrong; migrate the remaining demo-store features (Do queue, publicQuestions, press releases) onto Supabase and delete `lib/db.ts` from production paths; (2) **the 72-page surface with a redirect graveyard** — fine today, but each stub is a place for gates and copy to rot; schedule a deletion pass once redirects have been live a quarter; (3) **duplicated cross-cutting patterns** (cron auth, fetch/busy/error, env parsing) — extract `lib/cronAuth.ts`, a `useApi` hook, and `scripts/_env.mjs`. Naming drift (ayrshare→Zernio, proof→Results, company→Reputation) is documented in comments — acceptable, but rename at the next major refactor. The `as never` casts at ComposeShell/store boundaries should become real types before more hands touch them.

---

## Executive summary

PubcoZone is a real, working product with a genuinely strong compliance core: every path that publishes to the outside world passes through layered checks (banned language, AI risk classification, mandatory disclosures, human approval), and the database itself enforces who can see and change what. The review found no evidence of committed secrets, and payment webhooks and admin impersonation are implemented carefully. However, three problems need urgent attention: the framework version has a known vulnerability that lets an attacker skip the login gate with a single crafted request; a typo-class mistake in the public-routes list quietly exempts a handful of authenticated pages from that same gate; and an editing loophole lets an already-approved post be rewritten and published without re-review — undermining the product's central promise. Beyond those, a paying customer's $3,500 research brief can silently fail with no retry, several endpoints can be abused anonymously (burning AI credits and exhausting a vendor quota), and fabricated demo posts — including a fake fraud accusation — can appear on real companies' public pages. Performance is acceptable today but one internal endpoint does dramatically too much work and is called several times per page. There are no automated tests at all, which is the biggest multiplier on every other risk; a small suite around the compliance rules would pay for itself immediately.

## Top 10 things to fix first

1. **Upgrade Next.js to ≥ 14.2.25** (CVE-2025-29927 middleware auth bypass) — one dependency bump. *(Critical, S1)*
2. **Fix `PUBLIC_PREFIXES` to match whole segments** so `/team`, `/ticker-audit`, `/terms` stop bypassing the gate; add a unit test for `isPublic()`. *(Critical, S2)*
3. **Close the Reg FD edit-after-approval loophole**: editing body/title resets status to draft and clears classification. *(High, B4)*
4. **Make brief fulfillment fail loudly**: webhook returns 5xx on fulfillment error (Stripe retries), checkout aborts if the order row wasn't created, add a re-fulfill cron for stuck `paid` orders, move LLM generation out of the webhook. *(High, B1/B2/B9)*
5. **Auth/abuse sweep on open endpoints**: require auth on `/api/social/connect` and the AI-spend routes, delete or gate `/api/reset`, stop trusting `x-vercel-cron`, rate-limit `/api/questions`, fix the account-health IDOR, escape user strings in email HTML. *(High, B3/B10-B12, S3-S5)*
6. **Stop seeding fabricated posts on real tickers** — demo content only on an explicit allowlist, or clearly labeled. *(High legal, F-3)*
7. **Fix the `company_data` last-writer-wins race** (dirty-key upserts or per-collection rows + optimistic concurrency). *(Critical data-loss, F-1)*
8. **Put `/api/state` on a diet**: one shared client fetch, trimmed payload, `count()` for openQuestions, per-request memoization of auth lookups; batch the `getUserById` N+1. *(High, P1/P2)*
9. **Fix the high client-state bugs**: CommsSidebar stale-closure unread badge, EditorialBoard stale-`posts` mutations, BoardQA sticky error + duplicate-reply window. *(High, B5/B6/B15/B16)*
10. **Stand up the first test suite** (Vitest): compliance gates, `buildChannelPost`, `publishGate`, board answered-logic, `fitToLimit`, `isPublic()` — the highest-leverage 200 lines of test code this repo can get. *(Critical multiplier)*

## Uncertainties / couldn't verify

- **CVE applicability** was judged from the pinned version (14.2.5) without a network advisory scan; the upgrade is warranted regardless. No full dependency audit (`npm audit`) was run.
- **Stripe field shapes** (B8) depend on the account's pinned API version — verify `invoice.subscription` vs `invoice.parent.subscription_details` in the Stripe dashboard before changing handlers.
- Whether `/ticker-audit` being public was intentional (it looks like a lead-gen tool; `/terms` public is clearly fine, `/team` clearly not).
- **Zernio behavior** (profile caps, orphaned-profile cleanup) is inferred from this codebase's calls, not provider docs.
- Production env vars were previously confirmed (`AUTH_ENABLED=1` live), but **preview-deploy env** is unverified — relevant to the default-open middleware finding.
- This was a static review: the app was not run, no build executed, and no load testing performed; performance findings are read-from-code, not measured.
