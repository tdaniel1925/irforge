# Migrations (ordered, reproducible)

The authoritative database definition. A fresh Postgres built from these files
in order must behave like production.

## Rules

- **Immutable + ordered.** Files are `NNNN_name.sql`, applied lowest→highest.
  Never edit an applied migration — add a new one.
- **`0001_baseline.sql` is the production snapshot.** It's the dump of the live
  schema + RLS policies (see `../DUMP-RUNBOOK.md`). Everything before this system
  lives in `../_archive/` and `../_ops/` for history only.
- **Schema only.** No customer-specific data. One-off ops go in `../_ops/`.
- **Idempotent where practical** (`create table if not exists`, `drop policy if
  exists` before `create policy`) so re-application is safe.

## Applying

- **Locally / CI:** `psql "$DATABASE_URL" -f` each file in order (the CI job does
  this against a clean Postgres — see `.github/workflows/db-migrations.yml`).
- **Production:** apply the new migration(s) since the last deploy via the
  Supabase SQL editor or `supabase db push`. The baseline is already in prod (it
  IS prod) — you only ever apply migrations numbered after it.

## Adding a change

1. Create `NNNN_short_name.sql` (next number).
2. Write idempotent DDL.
3. `npm run db:check` (or push a PR) — CI builds a clean DB from all migrations
   and runs the authz/tenant tests against it. Green = reproducible.
