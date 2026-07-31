# Production schema-dump runbook

Goal: capture the **live production schema + RLS policies** as one authoritative
artifact, so it becomes `migrations/0001_baseline.sql`. This is the one step
only you can do — the live DB, not the repo's SQL files, is the source of truth.

**We want schema ONLY — no data.** No table rows, no customer PII. Just tables,
columns, indexes, functions, and RLS policies.

---

## Option A — Supabase CLI (preferred)

If you have the Supabase CLI and your project linked:

```bash
# 1. Link (once), using your project ref from the Supabase dashboard URL:
supabase link --project-ref <your-project-ref>

# 2. Dump schema + policies only (no data):
supabase db dump --schema public -f supabase/migrations/0001_baseline.sql
```

`supabase db dump` defaults to schema-only and includes RLS policies. If it
prompts for the DB password, it's under Dashboard → Project Settings → Database.

---

## Option B — pg_dump directly

Get the connection string from Dashboard → Project Settings → Database →
Connection string (URI). Then:

```bash
pg_dump "postgresql://postgres:<password>@<host>:5432/postgres" \
  --schema=public \
  --schema-only \
  --no-owner --no-privileges \
  -f supabase/migrations/0001_baseline.sql
```

Flags: `--schema-only` (no rows), `--no-owner`/`--no-privileges` (portable —
strips Supabase-specific role grants so a clean CI Postgres can apply it).

> Note: `pg_dump` may NOT include RLS policies depending on version/flags. If the
> dumped file has `CREATE TABLE` but no `CREATE POLICY` lines, prefer Option A,
> or additionally run the policy dump below and append it.

### Policies only (if Option B missed them)

```bash
psql "postgresql://postgres:<password>@<host>:5432/postgres" -Atc \
"select 'ALTER TABLE '||schemaname||'.'||tablename||' ENABLE ROW LEVEL SECURITY;' \
 from pg_tables where schemaname='public'" >> supabase/migrations/0001_baseline.sql

pg_dump "postgresql://..." --schema=public --section=post-data --no-owner \
  | grep -A100 'POLICY' >> supabase/migrations/0001_baseline.sql
```

(Option A avoids this entirely — use it if you can.)

---

## After you have the dump

1. Confirm `supabase/migrations/0001_baseline.sql` exists and contains
   `CREATE TABLE`, indexes, functions, and `CREATE POLICY` lines — **no INSERTs**.
2. Sanity-check it has **no secrets or data** (it shouldn't with `--schema-only`).
3. Hand it back to me. I will:
   - Verify it applies cleanly against a clean Postgres (the CI job does this).
   - Archive the 56 old SQL files into `supabase/_archive/` and `supabase/_ops/`
     per `MIGRATION-MANIFEST.md` (nothing deleted — moved).
   - Wire the CI job to build from it and run authz/tenant tests on the fresh DB.

From then on, every schema change is a new numbered migration and CI proves the
repo can rebuild the database.

---

## What NOT to do

- Don't dump **data** (`--schema-only` is required — protects PII).
- Don't paste the dump contents into chat if it somehow contains rows; just
  confirm the file exists and I'll work from the repo file.
- Don't delete the old 56 SQL files yourself — I'll move them to `_archive`/`_ops`
  so history is preserved.
