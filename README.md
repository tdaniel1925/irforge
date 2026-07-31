# PubcoZone — AI investor relations for public companies

A multi-tenant SaaS platform for public-company investor relations. Companies
turn SEC filings into compliant, multi-channel investor communications (nothing
publishes without human approval); individual investors get a public research +
discussion side; and a platform-operations back office runs the whole thing.

> Formerly "IRForge." The name, data layer, and scope have changed substantially
> from early single-company/local-demo versions — this README reflects the
> current app.

## Four audiences, one codebase

The app serves four distinct principals (see `lib/authz/`):

| Principal | What they do |
|---|---|
| **Public visitor** | Browse public ticker pages, filings, the discussion board; submit a company claim |
| **Investor member** | A `members` account — watchlist, board posts/questions, reactions, own profile. Never enters a company console. |
| **Company member/admin** | A `company_users` membership — run a company's IR: compose/approve/publish, CRM, compliance, calendars. Admins also manage team, settings, billing. |
| **Platform operator** | Super-admin (`platform_admins`) — the Platform Operations back office: customers, users, investors, metrics, claims, feature flags, impersonation. |

## Core capabilities

- **Compose → approve → publish** pipeline with a canonical service layer
  (`lib/services/`): Reg FD classification (green/yellow/red), a banned-claims
  compliance filter, RED-needs-counsel sign-off, quiet-period blocks, and
  disclosures appended in the publish path (physically can't be edited out).
- **Multi-channel publishing** via Ayrshare/Zernio (X, LinkedIn, Facebook, etc.).
- **Public discussion board + investor Q&A** — moderated, identity-verified,
  with AI-drafted compliant answers grounded in the public record.
- **CRM, cap table, document vault, editorial calendar, reputation/threats,
  intelligence summaries** — gated by plan tier + per-company feature flags.
- **Billing** — Stripe tiers (free/board/starter/growth/pro) for companies and a
  member plan for investors; comped/promo accounts supported.
- **Integration gateway** (`app/api/gateway/`, `lib/gateway/`) — scoped tokens +
  OAuth 2.0 + an MCP endpoint so an external control plane (e.g. Jordyn) or Claude
  can drive a company's back office with the same gates. Two-phase confirmation
  for sensitive actions. Signed outbound events for board questions, etc.
- **Audit log** — append-only record of sensitive reads and all writes.

## Authorization model (the one to understand first)

Access is computed by **one canonical resolver** (`lib/authz/capabilities.ts`),
consumed by both the client (`/api/state` → `FeatureGate`) and server guards
(`lib/authz/guard.ts`) so they can't disagree. Precedence:
`super-admin → comped → tier → per-company feature flag → deny`. Actor role +
scope gate the specific action on top. RLS is defense-in-depth, not the primary
API permission layer. See `.forge/` and the tests in `lib/__tests__/` for the
authz/parity coverage.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · **Supabase** (Postgres, Auth,
RLS — multi-tenant) · **Stripe** (billing) · **Ayrshare/Zernio** (social publish)
· **Resend** (email) · **Anthropic** (text drafting) + **Google GenAI/Gemini**
(images) · SEC EDGAR · Vitest.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest
npx tsc --noEmit   # typecheck
```

Local dev runs in a **single-company demo mode** when Supabase env vars are
absent (`lib/authGate.ts` keeps auth OPEN locally; deployments fail CLOSED).
**This behaves materially differently from production multi-tenancy** — never use
local-demo behavior as evidence that production permissions work. For real
permission/tenant work, point at a Supabase project (below).

## Environment variables

Set in `.env.local` (local) / Vercel (deployed). Core:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase (required for real multi-tenant mode) |
| `AUTH_ENABLED` | `1` enforces login. Deployments fail closed regardless (see `lib/authGate.ts`); redundant in prod but harmless |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MEMBER_WEBHOOK_SECRET` | Billing + webhooks |
| `ANTHROPIC_API_KEY` | Text AI (drafts, classification). Without it, deterministic templates |
| `GEMINI_API_KEY` | Image generation |
| `ZERNIO_API_KEY` | Social publishing (Ayrshare/Zernio) |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `OUTREACH_FROM` | Email + delivery events |
| `CRON_SECRET` | Cron route auth |
| `EVENT_ENC_KEY` | Encrypts outbound-event signing secrets at rest |
| `NEXT_PUBLIC_SITE_URL` | Absolute links in emails/events |
| `EDGAR_USER_AGENT` | SEC EDGAR requests |

## Database & migrations

The authoritative schema lives in **`supabase/migrations/`** (ordered,
reproducible). `0001_baseline.sql` is the production snapshot; `0000_supabase_
stubs.sql` lets a vanilla Postgres apply it in CI. See
`supabase/DUMP-RUNBOOK.md` (how the baseline is captured) and
`supabase/MIGRATION-MANIFEST.md`. The 56 legacy `schema-*`/`RUN-THIS-*` files are
archived in `supabase/_archive/` (schema) and `supabase/_ops/` (one-off data
scripts) — do not run them. New schema changes = a new numbered migration; CI
(`.github/workflows/db-migrations.yml`) rebuilds a clean DB from migrations and
runs the suite to prove reproducibility.

## Compliance posture (by design, not policy)

1. Flat fee, never compensation tied to investment outcomes.
2. Nothing publishes without named-human approval — no auto-approve.
3. Disclosures appended in the publish path, not an editable template.
4. AI drafts only from the public record.
5. Sensitive transitions are audit-logged.

## Repository layout

- `app/` — routes (pages under the company shell, `/member/*` investor shell,
  `/admin/*` platform ops, `/t/*` public, `app/api/*` endpoints)
- `lib/` — data + domain layers: `authz/` (capabilities + guards),
  `services/` (canonical post/approval/publish/CRM), `gateway/` + `oauth/`
  (integration surface), `supabase/` (clients + store), plus billing, compliance,
  AI, email, social
- `components/` — UI incl. `AppFrame` (shell selection), `Sidebar`, `admin/`
- `supabase/` — migrations + archived legacy SQL + runbooks
- `.forge/` — architecture/review notes
