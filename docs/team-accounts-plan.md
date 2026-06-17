# Team Accounts & Roles — Implementation Plan

Goal: companies have multi-user accounts with an **admin** who invites **members**.
Members get the shared company dashboard **plus** their own workspace. Investors/
researchers keep their separate, limited accounts. Decisions: CRM is **shared with
an owner** (team sees all, filter to "mine"); seats are **unlimited for now** (no
per-seat billing yet).

## Three access tiers
- **Investor / Researcher** (`account_type=member`): only investor features
  (research, watchlist, screener, portfolio x-ray, board). Already exists.
- **Company member** (`company_users.role='member'`): shared company dashboard +
  their own personal workspace (CRM ownership, email, notes).
- **Company admin** (`company_users.role='admin'`): everything + team admin console
  (invite/remove users, change roles, billing).

## Core model change: 1 user→1 company  becomes  many users→1 company
Today `companies.unique(owner_id)` + RLS `owner_id = auth.uid()` everywhere.
New join table:

    company_users(company_id, user_id, role 'admin'|'member', status 'active'|'invited',
                  invited_email, invited_at, created_at, UNIQUE(company_id,user_id))

RLS rewrite: every `company_id in (select id from companies where owner_id=auth.uid())`
becomes `company_id in (select public.my_company_ids())`, where:

    my_company_ids() = company ids where the user is an ACTIVE company_users row,
                       PLUS (back-compat) companies they own directly.

`companies` self-policy: readable/writable by active members; admin-only for writes
that matter (handled in app layer + a role check for destructive ops).

Founding owner is migrated to an `admin` membership so existing companies keep working.

## Phases
1. **Membership + RLS (THIS PHASE):** add company_users + my_company_ids() +
   is_company_admin(); migrate every owner to an admin membership; rewrite all RLS
   to membership; keep getMyCompany working (resolve via membership, fall back to
   owner). Drop `unique(owner_id)`. Verify tenant isolation (two companies, no leak).
2. **Team admin console:** /admin/team (admins only) — invite by email (Resend +
   token), accept-invite flow, role change, remove user; login routing by membership.
3. **Personal workspaces:** add owner_user_id to CRM/email/workspace; "mine vs team"
   filters; per-user inbox.
4. **Polish:** seat limits/billing, who-did-what audit, permission edge cases.

## Risks
- RLS rewrite is the #1 trust property — adversarially test cross-company isolation.
- "One company per user" assumed across code (getMyCompany auto-creates). Becomes
  "get my active company membership".
- Keep the public board / member / brief policies unchanged.
