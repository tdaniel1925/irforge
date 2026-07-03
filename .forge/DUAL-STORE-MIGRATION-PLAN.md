# Dual-store migration — plan

**Date:** 2026-07-02 · Status: PROPOSAL (awaiting approval before any code changes)

## What "the dual store" actually is (clarified)

There are really THREE storage patterns in the app, not two. Naming them precisely
matters, because the fix and risk differ:

1. **First-class Supabase tables** — `iros_posts`, `public_board`, `companies`,
   `company_users`, `sponsored_briefs`, `company_features`, `email_events`,
   `outreach_leads`, `company_stats`, `watches`. Proper rows + RLS. **These are fine.**

2. **`company_data` JSONB collections** (`lib/supabase/store.ts`, 16 collections:
   filings, drafts, audit, investors, mentions, metrics, scoreHistory,
   publicQuestions, pressReleases, disclosureChecks, calendar, contacts, documents,
   docAnalyses, convertibleNotes, capTable). These ARE persisted to Supabase for
   logged-in users (one JSONB blob per collection per company), RLS-isolated. They
   work — but the whole-collection read/write is what caused the last-writer-wins race
   (already mitigated to dirty-only writes). This is **tech debt, not a data bug.**

3. **Local JSON demo store** (`lib/db.ts` `getDb()`) — only reached when NOT
   authenticated (demo mode). In production (AUTH_ENABLED=1) middleware blocks
   anonymous access, so this is unreachable for real users. **Not a production risk;
   it's a dev convenience that keeps the code path alive.**

## The ACTUAL bug worth fixing (small, high-value)

The real "shows wrong data in production" problem is narrow: **a few pages read the
JSONB `drafts`/`publicQuestions` collections for COUNTS/LISTS while the live product
runs on the first-class tables (`iros_posts`, `public_board`).** These are the true
divergences:

| Surface | Reads (stale) | Should read | Symptom |
|---|---|---|---|
| `app/proof/page.tsx` | `db.drafts` (posted count, published list) | `iros_posts` published rows | Results page under/over-counts real published posts |
| `app/company/page.tsx` | already fixed to `db.openQuestions` (live) | — | ✅ done last session |
| `app/do/page.tsx` + `components/ApprovalsInbox.tsx` | `db.drafts` queue | `iros_posts` needs-approval | The "Do queue" is a parallel approval pipeline to `/posts` |
| `/api/drafts/*`, `/api/press`, `/api/questions/[id]/draft`, `/api/mentions/[id]/reply` | `db.drafts`/`publicQuestions`/`pressReleases` | first-class equivalents | Draft/answer/press flows persist to JSONB, disconnected from `/posts` + `public_board` |

## Recommended approach — SCOPED, not a big-bang rewrite

Do NOT migrate all 16 JSONB collections. Most (filings, investors, capTable, contacts,
documents, calendar) work fine as JSONB and have no divergent twin — migrating them is
churn with no user-visible benefit and real regression risk.

**Migrate only the collections that have a divergent first-class twin** — the content
pipeline. Three phases, each independently shippable and reversible:

### Phase 1 — Results/Proof reads live data (LOW risk, ~half day)
`app/proof/page.tsx`: replace `db.drafts`-derived "published posts" + count with a
query against `iros_posts` (status=published) + the existing score history. No schema
change; read-only swap. Ship, verify the numbers match reality, done. **This is the
single highest-value slice** — it's the page you show your board.

### Phase 2 — Retire the Do queue in favor of /posts (MEDIUM, ~1-2 days)
The `db.drafts` "Do queue" (`/do`, `ApprovalsInbox`) is a second approval pipeline that
predates the `iros_posts`/`/posts` system. Options:
  a. **Redirect `/do` → `/posts`** and delete `ApprovalsInbox` + the `db.drafts`
     approval flow (they're superseded). Lowest effort, removes the divergence by
     deletion. RECOMMENDED — the `/posts` "Needs approval" tab already does this job.
  b. Migrate `db.drafts` rows into `iros_posts` and keep both UIs. More work, keeps
     redundancy. NOT recommended.
Before deleting: confirm no company relies on `/do` (check audit log / usage). If
unused, this is a delete, not a migration.

### Phase 3 — Public-answer + press + mention flows onto first-class tables (MEDIUM)
`/api/questions/[id]/draft`, `/api/mentions/[id]/reply`, `/api/press` write to JSONB
`publicQuestions`/`drafts`/`pressReleases`. Point them at:
  - Board answers → the existing `public_board` verified-reply flow (Phase already
    proven by the Investor Q&A inbox). The old `publicQuestions` JSONB path is dead
    once `/company`'s BoardQA is the answer surface.
  - Press releases → a `press_releases` first-class table (small new table + RLS), or
    keep as JSONB if it never diverges (it currently has no live twin — LOWEST priority).

## What to explicitly NOT do
- Don't migrate filings/investors/capTable/contacts/documents/calendar JSONB — no twin,
  works fine, pure risk.
- Don't delete `lib/db.ts` — it's the demo/local-dev path; keep it, just ensure prod
  never falls through to it (already guarded by middleware + the authed checks we added).
- Don't do it all in one PR. Three phases, three deploys, verify between each.

## Suggested order & effort
1. **Phase 1 (Proof/Results)** — half day, low risk, high visibility. Do first.
2. **Phase 2 (retire /do)** — after confirming /do is unused; mostly deletion.
3. **Phase 3 (answer/press flows)** — last; the Investor Q&A inbox already covers the
   important half (board answers), so this is cleanup.

Net: the scary "dual store" is mostly a naming problem + one genuinely stale page
(Proof) + one redundant legacy queue (/do). Not a multi-week rewrite — ~3 scoped,
reversible slices.
