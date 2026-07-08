# State-Consistency Gap Audit — Admin / Back-Office & Data-Driven Surfaces

Scope: admin customers/console, admin claim queue, leads, proof, company (reputation),
posts, Investor Q&A, CRM. Reference bug class: UI offering an action that contradicts
the state it displays (e.g. "claim this page" on an already-claimed page).

## FIXED

### 1. Billing actions contradict "active" subscription status — HIGH
`app/admin/customers/page.tsx:258-281` (Companies list)
The row prints the subscription status (e.g. **active**) and then, unconditionally,
offered **Send subscription invoice**, **Comp**, and **🎁 Comp full (free)**. So a
company shown as *active/paid* still displayed "subscribe them" and "comp to active"
buttons — a direct status↔action contradiction that would double-bill or re-comp a
paying customer.
Fix applied: computed `const isActive = c.subscription_status === "active"` and gated
the tier `<select>`, **Send subscription invoice**, **Comp**, and **Comp full** behind
`{!isActive && (…)}`. **Setup fee**, **Act as**, and **Cancel** (already guarded by
`c.stripe_subscription_id`) remain available in every state. `npx tsc --noEmit` clean.

## REVIEWED — NO BUG (consistent guards already present)

- **admin/page.tsx (claim queue)** — Verify/Reject render only inside
  `data.claims.filter(c => c.status === "pending")` (lines 75-92); a verified/rejected
  claim can't show action buttons. Stats (`pendingClaims`) come from the same server
  payload as the list. Consistent.
- **admin/leads + Lead Finder** — Send targets only `l.status === "new" || "queued"`
  (lines 136, 294); contacted/sent/opted-out leads are excluded from the "Send to N
  ready" count and from the send set. Consistent.
- **components/BoardQA.tsx (Investor Q&A)** — an answered question is dropped from the
  open list on successful post (`drop()`, line 116); busy is deliberately NOT cleared on
  success to prevent a duplicate verified reply. "Draft answer" only shows while
  `draft === undefined` (line 154). Consistent.
- **app/company/page.tsx (Reputation)** — DEFEND count uses `threats.threats.length`
  and the list maps the same array; `highThreats` derives from the same data (lines
  117-119, 155). No "0 threats but threats listed" gap. `openQuestions` (line 132) and
  BoardQA both derive from `countOpenQuestions(ticker)` / `/api/board/questions`.
- **app/proof/page.tsx** — "Posts published" count and the "Published posts" list both
  read the single `posted` array from `/api/iros/published` (lines 56, 73-93). Consistent.
- **components/CrmWorkspace.tsx** — Deals `move()` keeps `status` in sync with `stage`
  (`won→won`, `lost→lost`, else `open`, line 304); tab/dashboard counts use
  `status === "open"` and the kanban filters by `stage`, which agree for app-created
  deals. Tasks split cleanly into `!done` (open) and `done` sections (line 373);
  completing a task moves it via server round-trip. `optedIn` badge reflects the stored
  boolean directly. Consistent.
- **components/ImpersonationBanner.tsx** — renders only when `co` is set; Exit issues
  DELETE then redirects. Enter (`impersonate`) sets the cookie server-side then navigates.
  No stale enter/exit state.

## NOTE (structural — not fixed)

- **components/PostsShell.tsx:88,98** — the "Scheduled" list view and the "Published" tab
  both render `<SocialOutbox initialPosts={outboxPosts} />` with the same `outboxPosts`
  prop. Whether a scheduled-but-unsent post can appear under "Published" depends on
  SocialOutbox's internal status filtering (not inspected here). Ambiguous/structural —
  flagged for review, no guard applied.
