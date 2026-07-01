# Architecture & Maintainability Review — PubcoZone / IRForge

**Scope:** Next.js 14 App Router app at `irforge/`. Reviewed: `middleware.ts`, `lib/db.ts`, `lib/supabase/store.ts`, `lib/supabase/server.ts`, `lib/iros.ts`, `lib/social/calendar.ts`, `lib/compliance.ts`, `lib/ayrshare.ts`, `lib/publicStats.ts`, `lib/board.ts`, `lib/platform.ts`, `components/AppFrame.tsx`, `vercel.json`, representative `app/api/**` routes, and a full inventory of the 72-page `app/` surface.

**Date:** 2026-07-01

---

## 1. The big picture

### Components and data flow

**Request path:** Browser → `middleware.ts` (Supabase session cookie refresh + auth gate, but ONLY when `AUTH_ENABLED=1`) → App Router page or `app/api/**` route handler → one of **three data seams** → external services.

**The three data seams:**

1. **Legacy JSON/"collections" store** — `lib/db.ts` (`getDb`/`getStore`/`saveDb`). Originally a local `data/db.json` file; `getStore()` now transparently swaps in `lib/supabase/store.ts:loadCompanyDb()` when a user is authed, which materializes the *entire* app-shaped `Database` object from 16 JSONB rows in the `company_data` table (one row per collection: `drafts`, `filings`, `audit`, `calendar`, `capTable`, …). Routes mutate the object in place and call `save()`, which upserts **all 16 collections** back.
2. **Normalized Supabase tables** — `lib/iros.ts` + `lib/social/calendar.ts` operate directly on `iros_posts`, `iros_approvals`, `iros_disclosure_events`, `iros_voice_profiles`, `iros_stakeholders`, `iros_interactions` via `createServerSupabase()` (RLS-scoped), keyed by `getMyCompany()`.
3. **Public/service-role layer** — `lib/publicStats.ts`, `lib/board.ts`, `lib/companyStats.ts` use `createServiceClient()` (RLS bypass) for the session-less public surfaces: ticker boards (`public_board`), views (`ticker_views`), watches, leads, discovery leaderboards. `lib/publicStats.ts` is itself dual-mode (Supabase when configured, local JSON `data/public-stats.json` otherwise).

**External services:** Anthropic Claude (`lib/ai.ts` — drafting, Reg FD classification), Google Gemini (`lib/image.ts` — branded images), Zernio (`lib/ayrshare.ts` — social OAuth connect + publish/schedule), Stripe (`lib/billing.ts`, two webhook secrets: company + member), Resend (`lib/email.ts`), SEC EDGAR (`lib/edgar.ts`).

**Multi-tenancy:** `lib/supabase/store.ts:getMyCompany()` is the tenant resolver used by every authed feature — it resolves via admin impersonation cookie (super-admin verified) → active `company_users` membership → pending invite auto-accept → owned company → mint-new-company. `lib/platform.ts` layers super-admin checks, per-company feature flags (`company_features`), comped detection, and the append-only `audit_log`.

**Publish pipeline (canonical flow):** compose (`/compose`) → `iros_posts` draft (status machine `draft → reviewed → approved → scheduled → published`, with `pulled`) → regex compliance scan (`lib/compliance.ts:checkContent`) merged with AI Reg FD classification (green/yellow/red; blocked language forces red) → human approval; RED requires counsel sign-off with a SHA-256 signature hash (`lib/iros.ts:recordApproval`) → quiet-period and quiet-mode gates → disclosures appended at publish time → `lib/ayrshare.ts:publishToChannels` (Zernio) → cron `reconcile-social` confirms delivery every 15 min.

**Crons (`vercel.json`):** `watch-alerts` (2h), `snapshot-stats` (30 min weekdays), `reconcile-social` (15 min), `daily-suggestions` (weekday noon), `board-digest` (daily). All authenticate via `x-vercel-cron` header or `CRON_SECRET`, run on the service-role client, and are time-budgeted (`deadlineMs`) — a genuinely good serverless pattern.

**Shell:** a single root `app/layout.tsx` wraps *all 72 pages* in the client component `components/AppFrame.tsx`, which decides bare/member/dashboard chrome by matching `pathname` against hardcoded lists. The `app/(app)/` route group exists but is **empty** — the layering that route groups should provide is instead simulated in client code.

---

## 2. Coherence: clean vs tangled

### 2.1 The demo-store vs Supabase-store split

**Verdict: the seam (`getStore()`) is a clever migration shim that has outlived its excuse.**

What's clean: `lib/db.ts:getDb()` explicitly guards production — `PROD_MODE` (`AUTH_ENABLED=1`) returns `emptyDb()` and never seeds/reads/writes the demo file. So Meridian Lithium demo data cannot leak into prod through `getDb()` itself. Good defensive comment discipline throughout.

What's tangled — features that silently degrade or run on the wrong store in production:

- **F-1 (High) — `app/api/badge/[ticker]/verified/route.ts` is production-broken by design.** It reads `getDb()` and compares `db.company.ticker` to the requested ticker. In prod, `getDb()` returns an empty DB (`company.ticker === ""`), so **every** "Verified by PubcoZone" badge renders "Claim this page" — including for real, onboarded customers who embedded it on their IR site. The correct check already exists: `lib/supabase/store.ts:isTickerClaimed()`. **Fix:** swap the route to `isTickerClaimed(ticker)`; delete the `getDb()` read.
- **F-2 (High) — Public-prefix API routes that call `getStore()` become silent no-ops in prod.** `middleware.ts` whitelists `/api/questions`, `/api/claim`, etc. as public; several of these (e.g. `app/api/questions/[id]/draft/route.ts`, `app/api/claim/route.ts`) use `getStore()`. Unauthed in prod → empty DB → mutations write to an in-memory object that only lives for the lambda invocation (`save()` → `saveDb()` writes a file on an **ephemeral Vercel filesystem**). The request "succeeds" and the data evaporates. **Fix:** every route reachable without a session must either use the service-role public layer (like `publicStats.ts`) or return 401; `getStore()`'s unauthed fallback should hard-fail (or log loudly) when `PROD_MODE` is true.
- **F-3 (Critical) — `save()` in `loadCompanyDb()` is a full-document last-writer-wins race.** `lib/supabase/store.ts:263-286`: every `getStore()` route loads all 16 collections, mutates one, then upserts **all 16**. Two concurrent requests (two team members, or a user + a webhook) silently clobber each other's writes across *unrelated* collections — approve a draft while a teammate adds a contact and one of the two changes disappears. No versioning, no `updated_at` check, no per-collection write scoping. This is the single biggest correctness landmine as team accounts grow. **Fix (incremental):** make `save()` take the set of dirty collections and upsert only those; add an optimistic-concurrency token (compare `updated_at` per row, retry on conflict); long-term, migrate hot collections (`drafts`, `contacts`, `documents`) to normalized tables like the `iros_*` family.
- **F-4 (High) — `lib/publicStats.ts:demoSeeds()` plants fabricated posts on real tickers in the production database.** `allPosts()` seeds four fake posts — including a fake accusation ("This is a pump and dump, management are scammers…") — onto **any unclaimed ticker's** public board, stored durably in `public_board`. The guard only protects *onboarded* tickers. For a real public company that simply hasn't signed up, the platform is authoring defamatory-looking content about them on a public investor board (and the fake "verified IR" post impersonates their IR team). This is a legal/product risk, not just tech debt. **Fix:** render demo posts client-side with an explicit "sample content" treatment and never persist them; or gate seeding behind a non-prod flag.
- **F-5 (Medium) — `lib/social/calendar.ts:getMonthCalendar()` mixes both stores in one response**: posts from `iros_posts` (Supabase), IR events from `getStore().db.calendar` (JSONB collection). Works, but it means the month grid's two halves have different consistency, auth, and migration stories. **Fix:** move `calendar` events into a normalized table or at least document the seam; it is currently invisible at the call site.
- **F-6 (Medium) — Two audit logs.** `lib/db.ts:logAudit` writes into the `audit` JSONB collection (mutable — anyone with the doc can rewrite history; "append-only by construction" only holds if every writer is polite), while `lib/platform.ts:writeAudit` writes the real `audit_log` table. Compliance posture (the product's selling point!) depends on which pipeline a feature happens to use. **Fix:** route `logAudit` through `writeAudit`; treat the JSONB `audit` collection as a read-only legacy view.

### 2.2 The two (actually three) post pipelines

There are **three** ways content gets published, not two:

1. **Legacy Draft/X-thread pipeline** — `app/api/drafts/route.ts` + `app/api/drafts/[id]/route.ts`: `db.drafts` (JSONB collection), statuses `pending/blocked/approved`, `publishGate()` + `buildPublishedThread()` (appends FLS **and** the third-party disclosure as extra tweets) → `postThreadToX`.
2. **IROS pipeline** — `lib/iros.ts`: `iros_posts` table, state machine, counsel sign-off, quiet periods.
3. **Social calendar layer** — `lib/social/calendar.ts`: also writes `iros_posts` (slot rows tagged `calendar_batch`), plus Quick Post (`app/api/social/quickpost/route.ts`) which publishes immediately and back-fills via `recordPublishedPost()`.

Findings:

- **F-7 (High) — The status state machine is defined but barely enforced.** `lib/iros.ts:TRANSITIONS`/`canTransition` is called from exactly **one** place (`app/api/iros/posts/route.ts:51`). `recordApproval`, `bulkDecision`, `scheduleApprovedPosts`, `reconcile*`, and `updatePostFields` all issue direct `status` updates that bypass it. Worse, `generateDailySuggestions` (calendar.ts:766) inserts posts with `status: "pending"` — a status that **does not exist** in the TRANSITIONS map, so a daily suggestion can never legally transition anywhere via the guarded route. **Fix:** funnel every status write through one `transitionPost(id, to)` helper that enforces `canTransition` and writes the audit row; add `pending` to the map (or stop using it).
- **F-8 (High) — Disclosure-appending logic diverges per pipeline.** Quick Post and board answers use `lib/compliance.ts:buildChannelPost()` — deliberately FLS-only ("the company sends its OWN posts, so the compensated-provider line is NOT appended"), with a compact X variant. But `scheduleApprovedPosts()` (calendar.ts:363) appends `flsText` **and** `disclosureText` on the same company-owned posts, ignores `CHANNEL_LIMITS` (a 280-char X post + full disclosures will be rejected or truncated by the network), and doesn't use the compact X form. Same company, same legal theory, two different disclosure outputs depending on which button was clicked. **Fix:** make `buildChannelPost()` the single disclosure assembler; have `scheduleApprovedPosts` call it per channel (it already knows `p.platform`).
- **F-9 (Medium) — The legacy Draft pipeline duplicates the IROS pipeline with weaker guarantees** (no Reg FD classification, no counsel stage, no audit-table writes, `db.drafts` racing per F-3). It is still generated by `/api/drafts` POST and by the daily cadence features. **Fix:** either port cadence drafts onto `iros_posts` (they already have a near-identical shape) and delete `Draft`, or freeze the legacy pipeline read-only.

### 2.3 Compose/posts surface split & the 72-page surface

The consolidation direction is right — `/compose` (create: post-now / schedule / plan-a-month / press) and `/posts` (review: approvals + review board + outbox + calendar) — but the residue is heavy:

- **F-10 (Medium) — Redirect graveyard:** 7 pure-redirect pages (`/social → /compose`, `/social/calendar|outbox|review → /posts`, `/studio → /compose`, `/calendar-os → /compose`, `/voices → /social/setup`) plus thin back-compat wrappers (`/approvals`, `/social/quickpost`). Each is a page bundle, a sidebar-temptation, and a cognitive tax. **Fix:** replace with `redirects()` in `next.config.mjs` (server-side 308s, zero page code) and delete the files.
- **F-11 (Medium) — Route publicness and chrome are defined in two hand-maintained lists that must stay in sync:** `middleware.ts:PUBLIC_PREFIXES` (auth) and `AppFrame.tsx:BARE_EXACT/BARE_PREFIXES` (chrome). They already disagree (`/snapshot` is public in middleware but not bare in AppFrame; `/embed` vs `/embed/`). A new public page needs edits in both files or it half-works. **Fix:** adopt the (currently empty) route groups: `app/(public)/`, `app/(dashboard)/`, `app/(member)/`, each with its own `layout.tsx`; derive middleware publicness from one shared constant module.
- **F-12 (Medium) — AppFrame's `ROUTE_FEATURE` gating is exact-match client-side only** (`ROUTE_FEATURE[pathname]` — `/crm/import` isn't gated even though `/crm` is), and it's a *client* gate; the API gates via `companyHasFeature` are the real enforcement, but the mapping lives in neither a shared module nor the server. **Fix:** move feature→route mapping server-side into the route-group layout, prefix-match, and share the map with the sidebar.
- **F-13 (Low) — 72 top-level pages in a flat `app/` directory** with at least four naming families for overlapping ideas (`/company` = "Reputation" per the sidebar; `/proof` = results/case-studies; `/intelligence` vs `/metrics` vs `/audit`; `/calendar` vs `/calendars` vs the social calendar inside `/compose`). New engineers cannot infer where a feature lives from its name. **Fix:** route groups (F-11) + a `docs/routes.md` one-liner per page; rename `/company` or the sidebar label so they agree.

---

## 3. Maintainability & tech debt (team-growth hazards)

- **F-14 (High) — Naming drift: ayrshare-that-is-Zernio.** `lib/ayrshare.ts` line 1: "backed by Zernio". Exported names (`createAyrshareProfile`, `ayrshareConfigured`, `AYRSHARE_CHANNELS`), DB column (`ayrshare_profile_key`), row field (`ayr_post_id`), and ~26 files keep the old vendor name; env var is `ZERNIO_API_KEY` while `.env.local.example` still documents `AYRSHARE_API_KEY` — a fresh deploy following the example ships with publishing silently in "simulate" mode (`publishToChannels` returns `ok:true, posted:false` when unconfigured!). **Fix (staged):** (1) fix `.env.local.example` today; (2) make unconfigured-publish loud in prod (error, not simulate — a compliance product must not pretend it posted); (3) rename module to `lib/publisher.ts` with vendor-neutral names; keep DB columns last.
- **F-15 (High) — `AUTH_ENABLED` is a default-open kill switch.** `middleware.ts:17`: unless `AUTH_ENABLED === "1"` *and* the Supabase URL is set, **all auth gating is off** and `lib/db.ts` runs in seeded demo mode. One missing env var on a new Vercel environment (preview deployments!) = an open app serving demo data at the production URL shape. **Fix:** invert the flag (`AUTH_DISABLED=1` for local dev only), or fail closed when `NODE_ENV === "production"` and the flag is absent; add `/api/health/auth` to deploy checks.
- **F-16 (Medium) — `getMyCompany()` is a getter with heavy side effects and per-request fan-out.** It can accept invites, claim ownerless companies, delete trigger-minted empty companies, and mint new companies — all inside a function called by nearly every authed request (often 2-3× per request via `myCompanyId()` + direct calls). It also makes up to 5 sequential DB round-trips (impersonation check, membership, pending invite, owned company, mint). **Fix:** split into `resolveCompany()` (pure read, request-memoized via React `cache()`) and an explicit `ensureMembership()` invoked at login/accept-invite; the write-on-read behaviors become auditable, testable events.
- **F-17 (Medium) — Config sprawl, no validation.** ~28 env vars (3 Supabase, 6+ Stripe incl. 5 price IDs, 5 email, `CRON_SECRET`, `SOCIAL_MONTHLY_DRAFT_CAP`, `GEMINI_API_KEY`, `ZERNIO_API_KEY`, `AUTH_ENABLED`, …), read ad hoc via `process.env` at 60+ sites, no startup schema. Misconfigurations degrade silently (simulated publishing, empty badge, auth off). **Fix:** a single `lib/env.ts` with zod validation, imported by `instrumentation.ts`; grouped config objects (`stripeConfig`, `publisherConfig`).
- **F-18 (Medium) — `company_data` JSONB collections have no schema or migration story.** Forward-compat is handled by hand in `getDb()` (`if (!cache.scoreHistory) …`) for the file store but **not** for rows loaded from Supabase in `loadCompanyDb()` — a collection missing from `COLLECTIONS` or a shape change requires touching `lib/types.ts`, `db.ts`, and `store.ts` in sync, and old rows are never migrated. **Fix:** version the document (`{ v: 2, items: [...] }`) or continue the normalization already proven by `iros_*`.
- **F-19 (Low) — `newId()` (db.ts:63-67) is a module-global counter + `Date.now()`** — fine single-process, collision-prone across serverless instances for the JSONB-collection entities. Use `crypto.randomUUID()` (already used for `calendar_batch`).
- **F-20 (Low) — Dead code / stragglers:** deleted-but-uncommitted `app/api/social/template/route.tsx` and `lib/postTemplate.tsx` (git status), the empty `app/(app)/` group, `lib/boards.ts` vs `lib/board.ts` twins. Sweep them.

---

## 4. Genuinely good architectural decisions

- **G-1 — Compliance gate layering is real defense-in-depth** (`lib/compliance.ts`, `lib/iros.ts`, `lib/social/calendar.ts`): regex fast-pass (with zero-width/letter-spacing evasion normalization) merged into AI Reg FD classification; blocked language *forces* RED; manual posts run the identical gate as AI drafts (`createManualPost`); RED requires counsel with a tamper-evident SHA-256 signature (body|decision|ts|actor); quiet periods block approval *and* scheduling *and* calendar slot creation; `scheduleApprovedPosts` re-checks RED at the last mile ("defense in depth: never schedule one even if it somehow did"). The honest comment that regex "is NOT a compliance certification" is exactly the right epistemics.
- **G-2 — Service-role isolation is disciplined.** `createServiceClient()` lives in one file with a clear contract; usage is confined to legitimately session-less contexts (public boards, crons, admin) — no leakage into client bundles found. Admin impersonation is cookie-triggered but **server-verified** against `platform_admins` on every resolution, so the cookie alone grants nothing.
- **G-3 — Middleware session handling is subtly correct** (`middleware.ts:40-60`): refreshed Supabase cookies are carried onto 401 and redirect responses (most teams drop them and get the bounce-to-login bug), and API routes get JSON 401s instead of HTML redirects. The comments explain *why* — high-value for maintainers.
- **G-4 — Fail-closed / fail-open choices are deliberate and mostly right:** `isSuperAdmin()` fails closed on any error; audit writes never break the user action but log server-side; `rateAllow` fails open with a stated rationale; `isTickerClaimed` degrades to "unclaimed" instead of crashing a public page.
- **G-5 — Crons are serverless-shaped:** time-budgeted loops (`deadlineMs`), per-company profileKey caching, dual auth (`x-vercel-cron` + `CRON_SECRET`), monthly AI draft caps (`SOCIAL_MONTHLY_DRAFT_CAP`) bounding spend, and dedupe guards (daily suggestions skip companies with a <20h-old suggestion).
- **G-6 — `effectiveCompanyAccess()` (platform.ts) gives UI and API one shared definition of access** — explicitly built so the client can't disagree with the server about comped/feature state. Same single-source instinct in `lib/board.ts` ("one definition of unanswered").
- **G-7 — The demo-data firewall in `lib/db.ts` (PROD_MODE → `emptyDb()`, never seed)** and the onboarded-ticker seeding guard in `publicStats.ts` show the team already recognizes the demo/prod contamination class of bug — the remaining findings (F-1, F-2, F-4) are gaps in an otherwise-established discipline, not an absent one.

---

## 5. Priority fix order

| # | Finding | Severity | Effort |
|---|---------|----------|--------|
| F-3 | Full-document last-writer-wins `save()` in `loadCompanyDb` | Critical | M — dirty-collection tracking + `updated_at` guard |
| F-15 | `AUTH_ENABLED` default-open auth | High | S — fail closed in production |
| F-4 | Fabricated demo posts persisted to real tickers' public boards | High | S — render-only demo content |
| F-1 | Verified badge always "unclaimed" in prod | High | S — use `isTickerClaimed` |
| F-8 | Divergent disclosure logic across publish paths | High | S/M — unify on `buildChannelPost` |
| F-7 | Unenforced post state machine + phantom `pending` status | High | M — single `transitionPost` helper |
| F-2 | Public API routes silently no-op on empty prod store | High | M — audit `getStore()` callers on public prefixes |
| F-14 | ayrshare/Zernio drift + stale env example + silent simulate-mode | High(doc)/Med(rename) | S then M |
| F-16 | `getMyCompany` side effects + fan-out | Medium | M |
| F-11/F-12 | Dual public-route lists; client-only feature gating | Medium | M — route groups |
| F-6 | Two audit logs with different integrity | Medium | S |
| F-17 | Env validation | Medium | S |
| F-5, F-9, F-10, F-13, F-18, F-19, F-20 | Remaining consolidation/cleanup | Low–Med | rolling |
