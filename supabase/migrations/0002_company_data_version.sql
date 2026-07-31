-- Optimistic-concurrency guard for the JSONB collection store (company_data).
--
-- company_data holds ~16 whole-document collections per company. Two teammates
-- editing the SAME collection concurrently silently overwrote each other
-- (last-writer-wins). This adds a version counter so a save can detect that the
-- row changed since it was loaded and REJECT the stale write instead of clobbering.
--
-- save() writes with `WHERE version = <loaded version>` and `version = version+1`;
-- zero rows updated ⇒ someone else won the race ⇒ the caller gets a conflict and
-- reloads. Protects all collections at once with no data migration.

alter table public.company_data add column if not exists version integer not null default 0;
