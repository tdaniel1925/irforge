# Security Audit — company-data API routes

Authorized defensive review of the owner's own Next.js app (`irforge`). Focus: do
mutating / money-spending routes verify auth + tenant ownership, and is per-tenant
isolation guaranteed?

## Trust model (confirmed)

- `middleware.ts:12-14` — when `AUTH_ENABLED=1` (confirmed live) AND a Supabase URL is
  set, every request is gated. `middleware.ts:43-56` returns a JSON 401 for any
  non-public `/api/*` path with no valid Supabase user.
- `lib/publicRoutes.ts:5` — **none** of the 15 audited routes are in `PUBLIC_PREFIXES`.
  So in production all 15 require a signed-in user. Whole-segment matching (`isPublic`)
  is correct and not bypassable by these paths.
- `lib/db.ts:72-81` `getStore()` → `loadCompanyDb()` (`lib/supabase/store.ts:263`).
  For an authed user this resolves the company via `getMyCompany()` (team membership →
  owned company), and reads/writes `company_data` rows scoped `.eq("company_id", mine.id)`.
  **Per-tenant isolation is enforced by Supabase RLS on `companies` / `company_data`
  plus the explicit `company_id` filter** — not by any in-route check.
- When NOT authed, `getStore()` falls back to the **shared local JSON store**
  (`lib/db.ts:79-80`, `authed:false`). In PROD `getDb()` returns an *empty* in-memory DB
  (`lib/db.ts:20-23`) that is never persisted to disk — so even if the fallback were
  reached, no cross-tenant demo data leaks and nothing is written to a shared file.

## Cross-cutting finding

**Not one of the 15 routes checks `authed`, calls `getMyCompany()`/`getMyRole()`, or
otherwise gates in-route.** They rely 100% on middleware + RLS. This is acceptable as
the primary control BUT is a single point of failure: if middleware is ever
misconfigured (allowlist typo, `AUTH_ENABLED` unset on a new deploy, a new matcher
exclusion), every AI route becomes an unauthenticated token-burn endpoint and every
mutating route writes to the shared local store. Defense-in-depth (an in-route
`if (!authed) return 401` on money/mutating routes) is recommended.

`getMyRole()` (admin vs member) is **not** consulted by any of these routes — members
can perform every mutation an admin can (cap table edits, filings, investor stage, etc.).
RLS scopes to the company but does not distinguish role (see comment at `store.ts:188-189`).

---

## Per-route findings

### AI spend routes

**app/api/ai/fit/route.ts — NEEDS-FIX**
- Mutates? No (read-only `db.company`). Spends? YES — `fitToLimit()` AI call (`:29`).
- Auth: middleware only; no in-route `authed` check. Reads `db.company` from
  `getStore()` (`:21`) — RLS-isolated when authed.
- Input: `text` unbounded length (no max), `channel` validated against `CHANNEL_LIMITS`
  (`:18-19`).
- Risk: unbounded `text` → uncapped AI token spend per call with no auth gate if
  middleware fails; add a length cap + `if (!authed) 401`.

**app/api/ai/polish/route.ts — NEEDS-FIX**
- Mutates? No. Spends? YES — `polishText()` (`:16`). Does NOT call `getStore()` at all.
- Auth: middleware only.
- Input: `text` capped at 8000 chars (`:14`) — good.
- Risk: pure AI-spend endpoint with no auth gate in-route; token burn if middleware
  misconfigured. Input bound is fine.

**app/api/ai/write-post/route.ts — NEEDS-FIX**
- Mutates? No. Spends? YES — `writePostFromTopic()` (`:16`). Reads `db.company` (`:15`).
- Auth: middleware only.
- Input: `topic` trimmed but **no length cap** (`:12-13`).
- Risk: unbounded `topic` → uncapped AI spend, no auth gate; add length cap + auth check.

**app/api/analyze/route.ts — HOLE (SSRF) + NEEDS-FIX**
- Mutates? YES — writes `db.docAnalyses` + audit (`:43-44`). Spends? YES —
  `analyzeDocument()` (`:32`).
- Auth: middleware only; no `authed` check. Writes via `getStore()` → RLS-isolated
  `company_data.docAnalyses` when authed.
- Input: `docName` capped 160, `text` min 40 chars; **`url` is fetched server-side with
  NO scheme/host validation** (`:16-23`).
- Risk: **SSRF** — attacker-controlled `url` is fetched by the server
  (`fetch(url, …)` at `:18`) with a 15s timeout; can hit internal/metadata endpoints
  (e.g. cloud metadata, `http://localhost`, `file://` is blocked by fetch but
  `http://169.254.169.254` is not). Combined with AI spend and DB write. Validate the
  URL: require `https:`, block private/loopback/link-local IPs and internal hostnames.

### Calendar

**app/api/calendar/route.ts — SAFE (with note)**
- POST mutates `db.calendar` + audit (`:18-23`); DELETE removes by id (`:35`). No AI/$.
- Auth: middleware only. Writes via `getStore()` → RLS-isolated `calendar` collection.
- Input: `date` sliced to 10, `title` capped 120, `type` allowlisted (`:12-13`),
  `note` capped 200. Well-validated.
- Risk: low — DELETE finds the event within the caller's own tenant DB (`:32`), so no
  cross-tenant delete. No auth-gated AI/external spend. Note the shared cross-cutting
  role finding (member can add/delete).

### Cap table

**app/api/captable/route.ts — SAFE (with note)**
- POST/PATCH mutate `db.capTable` (`:26`, `:37-39`). No AI/$.
- Auth: middleware only. RLS-isolated `capTable` collection.
- Input: `holder` capped 120, `shares` numeric>0, `class` allowlisted, `notes` capped
  400 (`:9-24`, `:38`). PATCH finds entry within caller's own DB (`:35`).
- Risk: low. Financial-cap-table data is sensitive but scoped by RLS; recommend
  restricting writes to `getMyRole()==="admin"`.

### Disclosure

**app/api/disclosure/route.ts — NEEDS-FIX**
- Mutates? YES — `db.disclosureChecks` + audit (`:27-28`). Spends? YES —
  `checkDisclosure()` AI (`:16`).
- Auth: middleware only. RLS-isolated.
- Input: `event` min 8 / capped 400 (`:12-13`) — good.
- Risk: AI spend with no in-route auth gate; token burn if middleware fails. Input
  bounded, no SSRF. Add `if (!authed) 401`.

### Documents

**app/api/documents/route.ts — SAFE (with note)**
- POST/PATCH mutate `db.documents` (`:25`, `:36-56`). No AI. PATCH `import_filings`
  copies from `db.filings` — same-tenant only. No external fetch.
- Auth: middleware only. RLS-isolated `documents` collection.
- Input: `name` capped 160, `category` allowlisted, `url`/`note`/`filedDate` capped.
- Risk: low. Stored `url` is user data displayed later — ensure the UI does not render
  it as an unsanitized link/`javascript:` scheme (out of scope here; flag for UI review).

### Investors

**app/api/investors/generate/route.ts — NEEDS-FIX**
- Mutates? YES — replaces `db.investors` wholesale + audit (`:75-77`). Spends? YES —
  `generateInvestorTargets` / `draftFundOutreach` AI **per fund** (`:31,55`) plus
  external SEC 13F fetches via `findRealFunds` (`:24`). `maxDuration=90`.
- Auth: middleware only. RLS-isolated `investors`.
- Input: **no request body at all** — takes zero params, so no injection, but also no
  rate limit; each call fans out to N AI drafts.
- Risk: **highest-cost route** — one unauthenticated call (if middleware fails) triggers
  many AI completions + external API calls. Add auth gate + basic rate limiting.

**app/api/investors/[id]/route.ts — SAFE**
- PATCH sets `inv.stage` (`:17`). No AI/$.
- Auth: middleware only. `db.investors.find(id)` operates on caller's own tenant DB
  (`:14`), so no cross-tenant update. `stage` allowlisted (`:11`).
- Risk: low.

### Filings

**app/api/filings/add/route.ts — HOLE (SSRF) + NEEDS-FIX**
- Mutates? YES — prepends to `db.filings` + audit (`:59-60`). Spends? external fetch.
- Auth: middleware only. RLS-isolated `filings`.
- Input: `form` capped 20, `title` capped 200, text capped 8000; **`url` fetched
  server-side with NO validation** (`:22-26`).
- Risk: **SSRF** — same class as analyze: `fetch(url, …)` (`:23`) on attacker URL,
  15s timeout, response body stored in `db.filings.fullText`. Can probe internal hosts
  and exfiltrate internal responses into stored data. Validate scheme/host as above.

**app/api/filings/sync/route.ts — SAFE (with note)**
- Mutates? YES — merges EDGAR results into `db.filings` + audit (`:17-22`). External
  fetch is to EDGAR only, keyed on `db.company.cik` (`:9`) — **not** user-supplied at
  call time, so no SSRF.
- Auth: middleware only. RLS-isolated.
- Input: none from body. Low risk; note the outbound EDGAR call has real cost/no rate
  limit but the target host is fixed.

**app/api/filings/[id]/generate/route.ts — NEEDS-FIX**
- Mutates? YES — adds a `Draft` to `db.drafts`, sets `filing.draftId` + audit (`:30-36`).
  Spends? YES — `generateFilingThread()` AI (`:15`).
- Auth: middleware only. `db.filings.find(id)` is within caller's own DB (`:11`), so the
  `[id]` param can't reach another tenant's filing. Guards against double-generate (`:13`).
- Input: `id` from path only.
- Risk: AI spend with no in-route auth gate; token burn if middleware fails. Isolation
  itself is fine. Add `if (!authed) 401`.

### Score / Threats

**app/api/score/route.ts — NEEDS-FIX**
- Mutates? YES — pushes to `db.scoreHistory` + audit (`:22-31`). Spends? external —
  `runTickerAudit(ticker, peers)` (`:14`), `maxDuration=60`. Ticker/peers come from the
  caller's own `db.company`, not the request body → no SSRF/injection.
- Auth: middleware only. RLS-isolated `scoreHistory`.
- Input: none from body.
- Risk: external-API spend with no in-route auth gate. Lower priority than AI routes but
  add auth gate for defense-in-depth.

**app/api/threats/rebut/route.ts — NEEDS-FIX**
- Mutates? YES — adds a `Draft` + a `calendar` reminder + audit (`:31-45`). Spends? YES —
  `generateRebuttal()` AI (`:19`).
- Auth: middleware only. RLS-isolated `drafts`/`calendar`.
- Input: `title` capped 200, `evidence` capped 400 (`:13-14`) — good.
- Risk: AI spend with no in-route auth gate; token burn if middleware fails. Input
  bounded, no SSRF. Add `if (!authed) 401`.

---

## Summary

- **HOLE: 2** — `analyze` and `filings/add` both server-side-fetch an unvalidated,
  attacker-controlled `url` (SSRF), each also spending AI / storing the response.
- **NEEDS-FIX: 9** — every AI/external-spend route relies solely on middleware for
  auth with no in-route `authed` gate; three (`ai/fit`, `ai/write-post`,
  `investors/generate`) also lack input length/rate caps. `investors/generate` is the
  highest-cost fan-out.
- **SAFE: 4** — `calendar`, `captable`, `documents`, `investors/[id]`, `filings/sync`
  are validated, non-spending or fixed-target, and RLS-isolated. (Recommend gating
  company-wide writes to `getMyRole()==="admin"`.)

### Priority remediations
1. Add scheme/host/private-IP validation to the `url` fetch in `analyze` and
   `filings/add` (SSRF).
2. Add `const { authed } = await getStore(); if (!authed) return 401` (defense-in-depth)
   to all AI/external-spend routes.
3. Add input length caps to `ai/fit` (`text`) and `ai/write-post` (`topic`); add rate
   limiting to `investors/generate`.
4. Consider `getMyRole()==="admin"` gating on company-wide/financial writes
   (captable, filings, disclosure text).
