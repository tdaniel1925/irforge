# Security Audit — Team / Account API Routes

Scope: authorized defensive review of owner's own Next.js app (`irforge`). Global gate: `middleware.ts` requires a signed-in user for all non-public routes when `AUTH_ENABLED=1` (verified live). Per-tenant isolation via `getMyCompany()` + Supabase RLS. Findings assess whether each route has a real auth+ownership gate, is safe purely via RLS, or is a hole.

Summary: **SAFE = 6, NEEDS-FIX = 0, HOLE = 0.**

---

## 1. `app/api/team/route.ts` (GET/POST/PATCH/DELETE) + `lib/team.ts`

**VERDICT: SAFE**

Mechanism: session Supabase client + RLS policies `company_users_read` (select) and `company_users_write` (all) in `supabase/schema-team.sql:68-77`. Write policy uses `USING`/`WITH CHECK = is_company_admin(company_id) OR is_super_admin()`. `is_company_admin` (schema-team.sql:52-61) is `SECURITY DEFINER` and checks an active `admin` membership (or `owner_id`).

- GET → `listTeam()` (lib/team.ts:36-68): reads `company_users` filtered to `getMyCompany().id`; RLS additionally scopes read to `my_company_ids()`. Cannot enumerate another company's roster.
- POST invite → `inviteTeammate()` (lib/team.ts:72-114): inserts a row with `company_id = mine.id`; RLS `company_users_write WITH CHECK` blocks the insert unless caller is admin of that company. A member's insert fails the policy and returns "Only admins can invite teammates." (lib/team.ts:91).
- PATCH role → `changeRole()` (lib/team.ts:116-127): `update ... .eq("id",memberId).eq("company_id", mine.id)`; RLS `USING` blocks non-admins. A member cannot self-escalate to admin (update denied by policy).
- DELETE → `removeMember()` (lib/team.ts:129-149): last-admin guard (lib/team.ts:142) + `delete .eq("id").eq("company_id", mine.id)`; RLS `USING` blocks non-admins.

Cross-company: every write is filtered by `company_id = mine.id` AND independently gated by `is_company_admin(company_id)`. Acting on another company's team requires admin membership there, which the attacker doesn't have. Member escalation: blocked by RLS on UPDATE. **No hole.**

Note (defense-in-depth, not a vuln): the route relies entirely on RLS for the admin check — there is no in-route `getMyRole()` gate. This is acceptable because `company_users_write` genuinely enforces admin-only at the DB. If RLS were ever disabled on `company_users`, all four verbs would be wide open, so the DB policy is load-bearing.

## 2. `app/api/team/accept/route.ts` + `lib/team.ts acceptInvite`

**VERDICT: SAFE**

Mechanism: in-lib check in `acceptInvite()` (lib/team.ts:167-199), service-role client.

- Token: `randomUUID()` v4 (122 bits entropy, lib/team.ts:79) — not guessable/enumerable. Stored in `company_users.invite_token` (schema-team-invites.sql:7).
- Signed-in required: `getUser()`; returns "Sign in first." if anon (lib/team.ts:170).
- Email match enforced: `invite.invited_email.toLowerCase() !== user.email.toLowerCase()` → rejected (lib/team.ts:180-182). You cannot accept an invite addressed to someone else even with a valid token.
- Single-use: lookup requires `status='invited'` (lib/team.ts:177); on accept it sets `status='active'` and `invite_token=null` (lib/team.ts:186), so the token can't be replayed.
- Arbitrary company join: only the exact `company_id` on the token's invite row is joined; no attacker-controlled company id. Admin-role invites claim ownership only of a still-`owner_id IS NULL` (promo/ownerless) company (lib/team.ts:192-196) — cannot hijack an owned company.

**No hole.** (Also note `getMyCompany()` step 2 auto-accepts a *pending invite matching the signed-in user's own email* via service role, store.ts:119-145 — still email-scoped to the caller, so not a bypass.)

## 3. `app/api/user-flags/route.ts` (GET/POST)

**VERDICT: SAFE**

Mechanism: in-route `getUser()` + RLS `user_flags_own` (schema-user-flags.sql:16-19, `USING/​WITH CHECK user_id = auth.uid()`).

- GET (route.ts:9-19): selects `.eq("user_id", user.id)` — own row only; RLS also scopes to `auth.uid()`. Anon returns defaults, no leak.
- POST (route.ts:22-33): 401 if anon; `flag` restricted to allowlist `{learn_visited, welcomed}` (route.ts:6,28) preventing arbitrary column write; upsert keyed `user_id = user.id`. RLS `WITH CHECK` blocks writing another user's row even if `user_id` were forged (it isn't — server-supplied). Cross-user read/write impossible.

## 4. `app/api/workspace/route.ts` (GET/POST/DELETE) + `lib/workspace.ts`

**VERDICT: SAFE**

Mechanism: `ctx()` (lib/workspace.ts:26-32) resolves `{cid,uid}` from `getUser()`+`getMyCompany()`; every query filters `.eq("user_id", uid)` (and list also `.eq("company_id", cid)`). RLS `user_workspace_own` (schema-workspace.sql:24-32) enforces `user_id = auth.uid() AND company_id IN my_company_ids()`.

- listNotes (workspace.ts:34-45): own rows only.
- upsertNote (workspace.ts:47-62): insert sets `user_id = uid`; update is `.eq("id",id).eq("user_id",uid)` — cannot update another user's note (row not matched + RLS `USING`). Cannot forge `user_id` (server-supplied).
- deleteNote (workspace.ts:64-68): `.eq("id",id).eq("user_id",uid)` + RLS — cannot delete another user's/company's note.

Notes are private even from teammates/admins (RLS is `user_id = auth.uid()`, not company-wide). **No hole.**

## 5. `app/api/notes/route.ts` (POST/PATCH) — convertible notes

**VERDICT: SAFE**

Mechanism: `getStore()` → `loadCompanyDb()` (db.ts:72-81, store.ts:263-304). This resolves the caller's company via `getMyCompany()` and loads the `convertibleNotes` collection **only** for `company_id = mine.id` from `company_data`, gated by RLS `company_data_members` (schema-team.sql:92-96, `company_id IN my_company_ids()`).

- POST (route.ts:7-31): appends to the in-memory company-scoped `db.convertibleNotes`; `save()` upserts back to that company's `company_data` row (RLS `WITH CHECK`). Input is length-capped/sanitized. No cross-tenant write path.
- PATCH (route.ts:33-42): `db.convertibleNotes.find(x=>x.id===b.id)` searches **only the caller's already-loaded company collection**. An id from another company simply isn't present → 404. There is no query by raw id against the DB, so a forged/foreign `id` cannot reach another tenant's data.

No in-route auth check, but in prod (`AUTH_ENABLED=1`) `getStore()` returns null-company → empty local DB is never used for a real tenant; a real write requires `getMyCompany()` to resolve, which requires a session. Cross-company read/delete blocked by the load being company-scoped + `company_data` RLS. **No hole.**

## 6. `app/api/onboard/lookup/route.ts` (GET)

**VERDICT: SAFE**

Mechanism: intentionally public onboarding step (ticker lookup). Returns only **public** data — `runTickerAudit(ticker)` pulls SEC/public-source info (company name, CIK, exchange, sector, score/grade, public watcher count, 12-mo filing count). No DB tenant data, no `getMyCompany()`, no `company_data`/`company_users` access. Input validated to `^[A-Za-z.\-]{1,8}$` (route.ts:10). It does not reveal whether a ticker is *claimed* on the platform or expose any company's private records — only info already public on EDGAR/market sources. No cross-tenant leak.

---

## Cross-cutting observations (informational, no action required)

1. **RLS is load-bearing** for the team routes (#1) and notes (#5) — there is no redundant in-route admin/company check on the four team verbs. Verified the policies (`company_users_write`, `company_data_members`) genuinely enforce the constraint, so this is acceptable, but disabling RLS on those tables would open real holes. Consider an in-route `getMyRole()==="admin"` assertion as defense-in-depth for the team route.
2. `getInviteByToken()` (lib/team.ts:152-163, service role) returns invited email + company name for a valid token to render the accept page. Requires possession of the 122-bit token; acceptable for a UX preview, not an enumeration risk.
3. Invite flow correctly uses service role only for the token-verified accept and the email-scoped auto-accept; no service-role path bypasses the email match.
