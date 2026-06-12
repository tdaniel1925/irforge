# IRForge — AI-Powered Investor Relations for Public Companies

Turns SEC filings into compliant X (Twitter) communications. Watches EDGAR, drafts threads,
enforces disclosure law in code, and never posts anything without human approval.

## Run it (zero setup)

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app seeds itself with a demo company
(Meridian Lithium Corp., $MLTH) on first launch — every feature works
immediately, fully offline. No database, no API keys required.

## Optional integrations

| Feature | How to enable |
|---|---|
| Claude AI drafting | Add `ANTHROPIC_API_KEY=sk-ant-...` to `.env.local` and restart. Without it, deterministic templates are used — everything else is identical. |
| Live EDGAR sync | Works out of the box when online — set your company's real SEC CIK in Settings, then click **Sync EDGAR** on the Filings page. |

## What it does

- **Filings** — watches EDGAR for 8-K/10-Q/10-K filings; one click turns a filing into a draft thread.
- **Approvals** — every draft requires a human decision. Approve, edit, reject. Publishing appends the
  Section 17(b) disclosure and forward-looking-statements notice automatically — the publish path
  physically cannot skip them.
- **Compliance engine** — banned-claims filter blocks price predictions, valuation claims
  ("undervalued"), investment advice ("buy now"), and guarantees before a human ever sees them.
  Blocked drafts cannot be approved until edited clean.
- **Quiet mode** — one switch suspends all publishing (pre-earnings / offering windows).
- **Mentions** — shareholder questions get replies citation-locked to public filings; questions that
  would require non-public information get a safe Reg FD deflection instead.
- **Investor Targets** — 13F-style peer-holder mapping with drafted outreach notes (sent by the
  company's own team — IRForge never solicits investors).
- **Metrics** — followers, impressions, mentions, sentiment; board-ready weekly numbers.
- **Audit log** — append-only record of every draft, decision, block, and publish.

## Compliance posture (by design, not by policy)

1. Flat fee, never compensation tied to investment outcomes.
2. Nothing publishes without named-human approval — no auto-approve, ever.
3. Disclosures are appended in the publish function, not in a template someone can edit out.
4. AI drafts only from the public record (filings, releases).
5. Every action is audit-logged.

> Demo/local build: "publishing" marks posts as posted in the local store. Wiring a real X API
> client means replacing the publish branch in `app/api/drafts/[id]/route.ts` — every compliance
> gate stays in front of it.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · local JSON store (`data/db.json`, auto-seeded,
delete it or use Settings → Reset to start fresh) · SEC EDGAR API · Anthropic Claude (optional).
