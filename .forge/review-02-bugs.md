# Review 02 — Bugs & Correctness Risks

Compiled from two deep sub-audits: API route handlers (19 findings) and client
components (17 findings). Line numbers verified against actual files at review time.

## HIGH — API routes

### B1. Paid $3,500 brief can silently never be generated (no recovery path)
`lib/briefs.ts:101-105` via `app/api/billing/webhook/route.ts:29-33`.
If `getPublicTickerAudit` fails transiently, the order is marked `paid` and the webhook
returns 200 — Stripe never retries and nothing in the repo ever re-processes `paid`
orders. Customer pays $3,500, gets nothing, no error surfaced.
**Fix:** return 5xx from the webhook on fulfillment failure (Stripe retries), or add a
cron/manual re-fulfill for `status in ("paid","ordered")`.

### B2. Brief order-row creation failure swallowed → payment with no fulfillment record
`app/api/brief/checkout/route.ts:42` + `lib/briefs.ts:77-85`.
`createBriefOrder` ignores the insert error and returns null; checkout doesn't check it.
Customer can pay with no order row to fulfill against.
**Fix:** abort checkout (don't return the Stripe URL) if the order row wasn't written.

### B3. Unauthenticated `/api/social/connect` POST can exhaust the Zernio profile cap
`app/api/social/connect/route.ts:33-84`. Anonymous callers trigger
`createAyrshareProfile`, consuming plan profile slots into a throwaway store. Repeated
calls hit `profile_cap` → real customers get 409 "account limit reached" (DoS on
paying customers + orphaned provider resources).
**Fix:** require `getMyCompany()` (401) before any profile creation.

### B4. Approved iros posts editable without status reset → bypasses the Reg-FD gate
`app/api/iros/posts/route.ts:57-64`. PATCH updates `body`/`title` regardless of status
and doesn't reset to draft or re-classify. Get a benign post approved, PATCH in new
material content, publish via `/api/iros/publish` (only checks status ∈ approved/
scheduled) — the compliance review the product exists for is bypassed. The legacy
pipeline resets edited drafts to pending (`app/api/drafts/[id]/route.ts:30`); this one
doesn't.
**Fix:** on body/title edit, reset status to draft (or block edits on approved+) and
clear classification.

## HIGH — client components

### B5. CommsSidebar unread badge is dead code (stale closure)
`components/CommsSidebar.tsx:53-55, 80`. The 30s interval + realtime subscription hold
the first-render `load` whose closure has `open === true` forever; collapsing the panel
still resets unread to 0 and advances lastSeenId. The `openRef` (lines 35-36) was
created to fix exactly this but is never used inside `load`.
**Fix:** use `openRef.current` in `load`, route interval/subscription through a loadRef.

### B6. EditorialBoard stale-`posts` closures overwrite concurrent updates / can crash
`components/EditorialBoard.tsx:125, 145, 156-157`. `classify`/`publish`/`approve` do
`{ ...posts.find(...)!, ...changes }` on the click-time array; racing a drag with a
classify snaps cards back, `approve` computes next status from stale state, and the `!`
assertion throws if the post was pulled meanwhile.
**Fix:** functional updates `setPosts(ps => ps.map(...))`; use the server-returned post.

## MEDIUM (selected)

- **B7. Stripe webhook DB writes unchecked** — `app/api/billing/webhook/route.ts:36-41,49,54`
  (+ member-billing): update errors discarded, 200 returned; paid customer stays
  inactive with no retry. **Fix:** return 5xx on update error.
- **B8. `invoice.payment_failed` reads `inv.subscription`** which moved on Stripe API
  ≥2025-03-31 (`invoice.parent.subscription_details.subscription`) — `past_due` never
  set; delinquent customers keep access. **Fix:** read both locations.
- **B9. $3.5k brief generation runs inline in the webhook** with no `maxDuration`
  (`lib/briefs.ts:111`) — Vercel default timeout aborts mid-LLM-call. **Fix:** mark paid,
  ACK, generate via cron/queue.
- **B10. Family of unauthenticated AI-spend routes** — `social/quickpost` preview,
  `press`, `drafts`, `questions/clusters`, `questions/[id]/draft`, `mentions/[id]/reply`
  run model calls without checking `authed` from `getStore()`. Anonymous token burn.
  **Fix:** 401 before any model call (mirror `onboard/route.ts:22-24`).
- **B11. `/api/reset` unauthenticated & destructive** (`app/api/reset/route.ts:6-9`) —
  wipes the local JSON store. **Fix:** super-admin gate or delete the route.
- **B12. IDOR on account-health probe** (`app/api/social/accounts/route.ts:20-25`) —
  arbitrary `accountId` probed cross-tenant (username, token validity, scopes).
  **Fix:** verify accountId ∈ caller's linked accounts.
- **B13. `send_subscription_invoice` leaves companies stuck "trialing"**
  (`app/api/admin/customer/route.ts:130-132`) — webhook never flips them active; MRR
  and status gates skewed. **Fix:** set active on creation or handle `invoice.paid`.
- **B14. Malformed JSON / missing `tweets` crashes drafts decision route**
  (`app/api/drafts/[id]/route.ts:17,26`) — raw 500s. **Fix:** `.catch(()=>({}))` +
  `Array.isArray` validation.
- **B15. BoardQA sticky error hides the whole Q&A list forever**
  (`components/BoardQA.tsx:43-52,121`) — one transient reload failure renders the error
  banner instead of the (still-updating) list. **Fix:** clear `err` on success.
- **B16. BoardQA 4s grace window re-enables "Approve & post"** → duplicate verified
  replies (`components/BoardQA.tsx:111,115`). **Fix:** keep busy/posted flag until drop.
- **B17. QuickPostComposer fit-failure leaves editor/preview out of sync silently**
  (`components/QuickPostComposer.tsx:201-208`); **accounts fetch swallows errors** and
  falsely renders "No accounts connected" (`:69-75`); **writeWithAI/fitChannel clobber
  concurrent typing** (`:98,201`). **Fixes:** surface errors, abort on unmount, disable
  textarea while busy.
- **B18. Drag-drop rollback restores a stale full snapshot**
  (`components/EditorialBoard.tsx:82-92`) — wipes fields updated concurrently.
  **Fix:** revert only status, functionally.

## LOW (selected)
- Resend webhook: no timestamp freshness (replayable), accepts-all when secret unset
  (warn only), swallows DB failures then ACKs (`app/api/email/webhook/route.ts`).
- `brief/publish` returns `{ok:true}` when zero rows matched (`lib/briefs.ts:120-128`).
- `iros/publish` marks published even if the status write fails (double-post risk);
  unknown PATCH actions return 200 (`app/api/drafts/[id]/route.ts:116-119`).
- Press-release approval skips `hasBlockingFlags` (`app/api/press/route.ts:42-46`) —
  blocked language can be approved (the drafts path checks it).
- Weekly-summary email relays to arbitrary addresses (`app/api/iros/summary/route.ts:33-43`).
- Outreach 25/day cap read-then-act race (`app/api/admin/leads/send/route.ts:46-59`).
- BoardQA liveNote timer overlap; MediaThumb retry timers fire after unmount;
  EditorialBoard error auto-clear erases newer errors; SmartTextarea stale Polish
  suggestion applies over newer text; CommsSidebar out-of-order load responses; unread
  count inflates when lastSeenId falls out of window; CommsSidebar setStatus optimistic
  with no rollback; generateImage parses body before the 503 short-circuit.

## Verified non-issues
Stripe webhook signatures verified against raw body; iros_posts cross-tenant blocked by
RLS; impersonation cookie re-verified server-side; team invite RLS + last-admin guard;
anonymous publishing can't reach other tenants' accounts (targetsFor returns [] without
profileKey); double-submit guarded on primary buttons (except B16); useAppState clean;
no conditional-hooks violations.
