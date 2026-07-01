# Review 04 — Performance, Code Quality, Testing

Scope: PubcoZone (Next.js 14 App Router, Supabase, Stripe, Anthropic/Gemini, Zernio, Vercel).
Severity scale: **Critical** (user-visible cost/risk on every request or regulatory exposure) → **High** → **Medium** → **Low**.

---

## PERFORMANCE

### P1 — CRITICAL: `/api/state` returns the entire company DB and runs ~8–11 DB round trips per hit, and 3–4 components fetch it independently per page load

**Where:**
- `app/api/state/route.ts:14-55` (the route)
- `lib/supabase/store.ts:252-256, 289-298` (`getFullDb` — the payload)
- `components/Sidebar.tsx:100`, `components/FeatureGate.tsx:16`, `components/FreeTierBanner.tsx:12`, `components/useAppState.ts:25`, `app/onboarding/page.tsx:36` (the duplicate fetchers)

**What happens on a single GET /api/state:**
1. `isSuperAdmin()` — `auth.getUser()` + `platform_admins` query (`lib/platform.ts:20-37`)
2. `getMyRole()` — `auth.getUser()` again + `getMyCompany()` + `platform_admins` **again** + `companies.owner_id` + `company_users` (`lib/supabase/store.ts:190-215`)
3. `getFullDb()` — `getMyCompany()` **again** + the full `company_data` fetch: **all 16 JSONB collections** (`filings, drafts, audit, investors, mentions, metrics, scoreHistory, publicQuestions, pressReleases, disclosureChecks, calendar, contacts, documents, docAnalyses, convertibleNotes, capTable`) serialized to the client, every time (`store.ts:293-297`)
4. `effectiveCompanyAccess()` — `isSuperAdmin()` **a second time** (already computed at route line 15) + `isCompedCompany` + possibly `getCompanyFeatures` (`lib/platform.ts:95-110`)
5. `countOpenQuestions()` — pulls **up to 2000 board rows** and filters in JS to produce one integer (see P3)

**Then multiply:** on a typical dashboard page load, `Sidebar` (needs only `superAdmin`, `ticker`, `openQuestions`), `FeatureGate` (needs only `authed` + `company.tier`), `FreeTierBanner` (tier), and the page's `useAppState` (full state) each fire their own `fetch("/api/state", { cache: "no-store" })`. That is **3–4 × (8–11 queries + a 2000-row board scan + a potentially multi-hundred-KB JSON body)** per navigation. Sidebar retries up to 3× on failure (`Sidebar.tsx:98-112`), amplifying under load.

**Why it matters:** this is the hottest endpoint in the app (every authed page). Cost scales with document count — a company with 500 contacts + docAnalyses + capTable will ship all of it to render a sidebar badge.

**Fix (concrete):**
1. Split the endpoint: `/api/state/summary` returning `{ flags, role, authed, fullAccess, capabilities, openQuestions, company: {id,name,ticker,tier} }` (~1 KB) and keep full collections behind per-feature endpoints loaded on demand.
2. Serve state once via a React context provider in the app layout (or SWR with a shared key) so Sidebar/FeatureGate/FreeTierBanner consume one fetch instead of four.
3. Memoize `isSuperAdmin`/`getMyCompany` per request (React `cache()` works in route handlers within a request) and pass `superAdmin` into `effectiveCompanyAccess` to kill the duplicate check.

### P2 — HIGH: N+1 `auth.admin.getUserById` loops

- `lib/team.ts:54-57` — `listTeam()` awaits `svc.auth.admin.getUserById(uid)` **sequentially per member**. 20 members ≈ 20 serial round trips on every team-page load. Fix: `await Promise.all(userIds.map(...))` — or better, one `auth.admin.listUsers` filtered call.
- `lib/adminCustomers.ts:114-118` — `getCustomerDetail()` calls `emailFor()` (which wraps `getUserById`) per team row. Parallelized via `Promise.all` but still N calls; same `listUsers` batching applies.
- `app/api/cron/board-digest/route.ts:46` — `companyNotifyTarget(ticker)` (includes a `getUserById`) per company, sequentially (see P4).
- Contrast: `lib/dashboard.ts:31-43` `emailsFor()` already does this correctly with `Promise.all` — reuse it in `team.ts`.

### P3 — HIGH: `lib/board.ts` fetches 2000 rows to compute a badge count

`lib/board.ts:31-40` (`fetchBoard`) pulls `id, author, body, created_at, verified, flag, parent_id` for up to 2000 posts; `countOpenQuestions` (`board.ts:75-77`) materializes all of it (including full `body` text) to return `questions.filter(!answered).length`. Called on **every** `/api/state` hit (route line 45) — i.e., 3–4× per page load — and again per company in the board-digest cron via `boardActivitySince` (`board.ts:80-98`).

**Fix:** compute the count in SQL. Two cheap queries: root questions (`flag='question' AND parent_id IS NULL`, `count` head) minus questions having a verified reply (`select parent_id ... where verified=true`), or a Postgres view/RPC. Keep `fetchBoard` for the Q&A inbox where full bodies are actually needed, and select only `id, created_at, verified, flag, parent_id` for counting paths (drop `body`).

### P4 — HIGH: cron loops run expensive work sequentially with no batching/time guard

- `app/api/cron/board-digest/route.ts:39-57` — for **every onboarded company**, sequentially: `boardActivitySince` (a 2000-row board fetch each, per P3) → `companyNotifyTarget` (DB + `getUserById`) → `sendBoardDigest`. No chunking, no elapsed-time early exit. At ~1s/company this times out somewhere past ~300 companies. Fix: batch 10–20 companies with `Promise.allSettled`, add the same 280s budget guard snapshot-stats uses, and parallelize `boardActivitySince`+`companyNotifyTarget` per company.
- `app/api/cron/watch-alerts/route.ts:95-142` — sequential `runTickerAudit(ticker)` (~3–5s each, external APIs) per watched ticker, plus nested sequential email sends per change × watcher. Fix: cap tickers per run + time budget; `Promise.allSettled` the email fan-out.
- `app/api/cron/snapshot-stats/route.ts:100-117` — sequential audits, but **has** a 25-ticker chunk and a 280s budget check (line 113). Acceptable by design (rate limits); budget is tight — monitor.

### P5 — HIGH: CRM import does up to 5,000 sequential upserts

`app/api/crm/import/route.ts:22-37` — `await upsertContact(...)` per row inside a `for` loop, cap 5,000 rows. A 1,000-row CSV ≈ several minutes and likely a route timeout. Fix: single bulk `upsert` (Supabase accepts arrays) in chunks of ~500, dedupe by email client-side first (the `seen` set already exists).

### P6 — MEDIUM: sequential awaits that should be `Promise.all`

- `app/app/page.tsx:50-79` — after the initial `Promise.all` (line 39), four independent await blocks run serially: `listPosts()` (51), `getMetrics()` (57), `getDashboardLayout()` (61), `getQuotes()` (67), then the morningRead/podcast pair. Fold all into one `Promise.allSettled` — Home is the most-visited page.
- `lib/adminCustomers.ts:107-128` — company row, team rows, `getCompanyFeatures`, audit log fetched serially; all independent.
- `app/api/state/route.ts:15,26,29` — `isSuperAdmin`, `getMyRole`, `getFullDb` are independent; parallelize (after the request-level memoization in P1 this mostly collapses anyway).

### P7 — MEDIUM: public board GET has zero caching

`app/api/board/route.ts:6` — `force-dynamic`, no `Cache-Control` on GET, and it's a public, high-traffic read (ticker pages). Fix: `Cache-Control: public, s-maxage=30, stale-while-revalidate=300` on GET only. Good news elsewhere: `/api/chart` (120s/900s), `/api/trending`, `/api/buzz`, `/api/movers`, `/api/badge/*`, `/api/og/*` all carry sane cache headers; `lib/tickerCache.ts:42-76` provides a 15-min in-memory + best-effort file cache (fragile on Vercel's read-only FS — consider `unstable_cache` for `getPublicTickerAudit`). `/api/state` `no-store` is **correct** (per-user superAdmin flag).

### P8 — LOW
- `app/api/admin/customer/route.ts:22` — 7 sequential `setCompanyFeature` upserts; batch into one multi-row upsert.
- **Bundle:** clean. `strict` Tailwind usage, no recharts/moment/lodash/pdf libs, `stripe` and `@google/genai` are server-only, no client import of `lib/db.ts`. No action needed.

---

## CODE QUALITY

### Q1 — MEDIUM: five identical `authorized()` cron-secret checks
Byte-identical copies at `app/api/cron/board-digest/route.ts:13-21`, `daily-suggestions/route.ts:8-16`, `reconcile-social/route.ts:8-16`, `snapshot-stats/route.ts:40-48`, `watch-alerts/route.ts:18-26`. A future fix (e.g., timing-safe compare) must be applied 5×. Fix: `lib/cron.ts` → `export function authorizeCron(req: Request)`.

### Q2 — MEDIUM: repeated fetch/error boilerplate across composer components
The same `try { fetch → res.json → if(!res.ok) throw d.error } catch { setError } finally { setBusy }` block appears ~15–20 times: `components/EditorialBoard.tsx:104,116,126,136,146`, `components/SocialEngine.tsx:79,102`, `components/QuickPostComposer.tsx:122,144,166,...`. `useAppState.act` (`components/useAppState.ts:45-65`) already implements this pattern — extract a standalone `useApiCall(url, opts)` hook (or export `act` decoupled from state refresh) and migrate.

### Q3 — MEDIUM: inconsistent API error shapes and response classes
- Mixed `NextResponse.json` vs bare `Response.json` — sometimes within one file (`app/api/watch/route.ts:16,54` uses `Response.json`; most routes use `NextResponse`).
- ~20 routes use the awkward `return { error: NextResponse.json({...}, {status:401}) }` wrapper requiring `if (g.error) return g.error;` unpacking (`app/api/dashboard/route.ts:10`, `app/api/comms/route.ts:10`) — replace with a thrown `ApiError` + shared handler, or a discriminated-union guard helper.
- Shapes: `{ error }` (~266 NextResponse + ~283 Response occurrences) vs `{ ok: ... }` (~94). 401 (47×) / 403 (32×) usage is mostly semantically correct (unauthenticated vs unentitled). Fix: one `jsonError(message, status)` helper in `lib/` and adopt in new code; don't mass-rewrite.

### Q4 — MEDIUM: `as never` casts hide prop-type mismatches
`components/ComposeShell.tsx:71,92,94` — `initialPosts={props.pipelinePosts as never}`, `initialStrategy={props.strategy as never}`, `initialSlots={props.slots as never}`. The shell declares these props as `unknown`/`unknown[]` (lines 27-31) and force-feeds strictly-typed children; any shape drift now fails at runtime, silently. Fix: export the prop types from `EditorialBoard`/`SocialEngine` and type `ComposeShellProps` with them.
Wider census (strict mode **is** on in tsconfig): `as never` ×10, `as unknown as` ×7 (mostly `lib/supabase/store.ts:37,269-271` — the untyped JSONB collection layer; a typed `Collections` map would fix all of them), `as any` ×2 (`MicDictate.tsx:15` SpeechRecognition — fine), `: any` ×27 concentrated in external-API parsers (`lib/audit.ts`, `lib/ayrshare.ts`, `lib/boards.ts`) — tolerable, but add schema comments.

### Q5 — LOW: dead code / stubs
- **Dead export:** `buildBackgroundPrompt` (`lib/image.ts:78-89`) — zero callers anywhere. Delete.
- **Redirect stubs (intentional back-compat):** `app/mentions/page.tsx:6` → `/company`, `app/metrics/page.tsx:6` → `/proof`, `app/calendar-os/page.tsx:2` → `/compose`, `app/admin/team/page.tsx:9` → `/team`, `app/social/page.tsx` → `/compose`. Fine for now; after a link audit these can become `next.config` redirects and the files deleted.
- **Not dead (verified live):** `app/do` (281-line queue page), `app/approvals` (thin wrapper over `ApprovalsInbox`), `app/audit`, `app/filings`, `app/proof`, `app/company`, `app/social/*` sub-routes.
- **Demo-store note:** `app/api/state/route.ts:54` — the unauthenticated fallback serves the local JSON `getDb()` with `fullAccess: true` and all capabilities on. Fine locally, but confirm middleware makes this branch unreachable in production; it otherwise hands demo data + open capability flags to anonymous callers.

### Q6 — LOW: legacy naming
- `lib/ayrshare.ts` actually calls **Zernio** (line 1 comment; `ZERNIO = "https://zernio.com/api/v1"` line 11). Implementation is correct; the filename/export names are the debt. Rename to `lib/zernio.ts` with a re-export shim when convenient.
- `/proof` renders "Results" (`app/proof/page.tsx:29`, `Sidebar.tsx:54`) and `/company` renders "Reputation" (`app/company/page.tsx:102`, `Sidebar.tsx:52`). UI labels are consistent; route names will confuse new devs. Document in a routes README or rename with redirects.
- Duplication check: `components/TeamManager.tsx` is the single team UI; `app/admin/team` is just a redirect — no stale copy exists.

### Q7 — LOW: scripts env-parsing duplication
`scripts/seed-sample-brief.mjs:14-19` and `scripts/cleanup-demo-data.mjs:12-17` each hand-roll `.env.local` parsing with slightly different regexes. Extract `scripts/_env.mjs` (a `scripts/_show.mjs`-style underscore helper already exists as precedent).

### Q8 — CLEAN (no action)
- `'use client'` in 86 files — sampled files all genuinely need it (hooks/handlers/browser APIs).
- Inline `style={{}}` in 14 files — all dynamic values (progress widths, computed font sizes); Tailwind tokens used otherwise.

---

## TESTING

### T1 — CRITICAL: there are zero tests
No `*.test.*` / `*.spec.*` files outside `node_modules`, no jest/vitest/playwright config, and `package.json` scripts are only `dev/build/start/lint`. For a product whose core promise is **compliance-gated public-company communications**, the publish/compliance path is entirely unguarded by CI.

**Five highest-value tests to write first (in order):**
1. **`lib/compliance.ts` — `checkContent`, `hasBlockingFlags`, `publishGate` (lines 41, 53, 99).** Pure functions, trivial to unit test, and a regression here publishes non-compliant material for a public company. Table-drive: forward-looking statements, MNPI phrases, quiet-period, per-channel disclaimers via `buildChannelPost` (line 82).
2. **`lib/board.ts` answered-question logic — `toQuestions`/`listOpenQuestions` (lines 43-72).** One shared definition powers the digest email, the badge, and the Q&A inbox; a bug silently mis-notifies companies. Test: question with unverified reply = unanswered; verified reply = answered; replies map to correct parents; `boardActivitySince` boundary timestamps.
3. **`fitToLimit` (`lib/ai.ts:1032`).** Per-channel caps drive the "Fit" feature (recent commit 75f4aa4); test the non-AI paths (already-fits passthrough, null on failure) with a mocked model, and that the result actually respects `limit`.
4. **Publish-gate route flow.** Integration test on the drafts/social publish handlers: free tier → 402, missing capability → 403, blocking compliance flag → rejected, happy path → Zernio client called with `buildPublishedThread` output (mock `lib/ayrshare.ts`).
5. **`middleware.ts` allowlist (matcher line 67) + `lib/platform.ts` access.** Assert public routes (`/t/*`, `/api/board` GET, `/api/badge/*`, login) pass unauthenticated and dashboard/API routes redirect/401 — a regression is either a data exposure or a full lockout. Include `effectiveCompanyAccess`/`isCompedCompany` unit tests (comped = active status + no Stripe sub, `platform.ts:71-79`).

**Setup recommendation:** Vitest (zero-config with TS paths) for 1–3 and 5's pure parts; a thin Playwright smoke suite (login → dashboard → compose → gate) later. Add `"test": "vitest run"` to CI before any of the P1/P3 refactors above so the board-count and state-split changes land safely.

---

## Summary counts

| Severity | Count | Items |
|---|---|---|
| Critical | 2 | P1 (/api/state payload + duplicate fetches + per-hit query fan-out), T1 (zero tests over compliance/publish gates) |
| High | 4 | P2 (getUserById N+1s), P3 (2000-row board scan for a count), P4 (unbatched cron loops), P5 (5,000 sequential CRM upserts) |
| Medium | 6 | P6 (sequential awaits), P7 (/api/board uncached), Q1 (5× authorized()), Q2 (fetch boilerplate), Q3 (error shapes), Q4 (as never casts) |
| Low | 6 | P8 (feature-flag loop), Q5 (dead export/stubs + demo fallback note), Q6 (naming), Q7 (scripts env dup), snapshot-stats budget, mixed Response classes |
