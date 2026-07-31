# SQL file inventory & migration plan  —  ✅ COMPLETE

Classifies all 56 `supabase/*.sql` files for the move to ordered, reproducible
migrations (review finding P0 #2). The **authoritative source of truth is the
LIVE production database** — these files are the (drifted) inputs that produced
it.

**Status: done.** Production schema was dumped to `migrations/0001_baseline.sql`
(50 tables, 61 RLS policies, 40 indexes, 9 functions, 0 rows). A `0000_supabase_
stubs.sql` provides the `auth`/`storage` schema stubs a vanilla CI Postgres needs.
Verified: a clean Postgres built from `0000` + `0001` applies with **zero errors**
and produces 51 tables + 61 policies. The 56 old files are archived below.

## Category A — SCHEMA (represented by the production baseline dump)

These define tables/policies/indexes. Their effect is captured by dumping the
live schema; they do NOT each become a separate migration. After the baseline is
in place they are **archived** (moved to `supabase/_archive/`), not deleted.

Base schemas:
`schema.sql`, `migrations-all.sql` (the 46KB monolith), `schema-billing.sql`,
`schema-briefs.sql`, `schema-briefs-sample.sql`, `schema-company-stats.sql`,
`schema-crm.sql`, `schema-iros.sql`, `schema-members.sql`, `schema-platform.sql`,
`schema-public.sql`, `schema-team.sql`, `schema-team-invites.sql`,
`schema-user-flags.sql`, `schema-workspace.sql`

Additive DDL patches (tables/columns/policies — all in the baseline):
`RUN-THIS-ayrshare-profile`, `RUN-THIS-board-notify-emails`,
`RUN-THIS-board-reactions`, `RUN-THIS-board-realtime`,
`RUN-THIS-board-rls-lockdown`, `RUN-THIS-brand-colors`, `RUN-THIS-brand-setup`,
`RUN-THIS-claim-verification`, `RUN-THIS-company-archive`,
`RUN-THIS-company-stats`, `RUN-THIS-crm-contact-fields`,
`RUN-THIS-dashboard-layout`, `RUN-THIS-email-events`, `RUN-THIS-events`,
`RUN-THIS-gateway`, `RUN-THIS-home-dashboard`, `RUN-THIS-idempotency`,
`RUN-THIS-investor-suspend`, `RUN-THIS-leads`, `RUN-THIS-member-profile-complete`,
`RUN-THIS-oauth`, `RUN-THIS-owner-nullable`, `RUN-THIS-post-status-canon`,
`RUN-THIS-realtime-comms`, `RUN-THIS-sample-brief`, `RUN-THIS-social-engine`,
`RUN-THIS-team-calendars`, `RUN-THIS-team-chat`, `RUN-THIS-team-invites`,
`RUN-THIS-ticker-views-daily`, `RUN-THIS-usage-quotas`, `RUN-THIS-user-flags`,
`RUN-THIS-welcomed-flag`, `RUN-THIS-workspace`, `fix-audit-delete`

> ⚠ A FEW of these carry data backfills alongside DDL (e.g. `post-status-canon`
> rescues rows, `board-reactions` may seed). Backfills are **idempotent** and
> already applied in prod; the baseline dump captures the resulting schema. No
> action needed — do NOT re-run them.

## Category B — ONE-OFF DATA / OPERATIONS (NEVER become migrations)

Customer-specific or operational scripts. They mutated data once; they are NOT
schema. Move to `supabase/_ops/` for historical reference; never in migrations.

- `RUN-THIS-add-tavares-amfn.sql` — added one user to one company
- `RUN-THIS-fix-tavares-state.sql` — fixed one user's state
- `RUN-THIS-comp-american-fusion.sql` — comped one specific company
- `RUN-THIS-phantom-cleanup.sql` — the diagnostic report (this session)
- `RUN-THIS-phantom-cleanup-apply.sql` — the reviewed one-off deletion (this session)
- `make-super-admin.sql` — grants super-admin to a specific user

## Category C — SUPERSEDED / redundant

- `migrations-all.sql` overlaps the `schema-*.sql` files (both define core tables).
  The baseline dump makes both obsolete. Archive together with Category A.

## Target end state

```
supabase/
  migrations/
    0001_baseline.sql        ← the production schema dump (authoritative)
    0002_*.sql               ← every future change, numbered, immutable
  _archive/                  ← all Category A + C files (historical)
  _ops/                      ← all Category B one-off scripts (historical)
  MIGRATION-MANIFEST.md      ← this file
```

Nothing is deleted — everything moves to `_archive/` or `_ops/` so history is
preserved and the top-level `supabase/` stops implying "run these."
