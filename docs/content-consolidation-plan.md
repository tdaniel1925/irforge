# Content / Posting Consolidation Plan

Goal: collapse **9 content pages → 3** (Compose · Posts · Home) + a brand **Setup**
settings page, automating away repetitive steps while keeping every compliance gate
(human approve, Reg-FD ack, counsel, quiet-mode, auto-disclosures) intact.

## Current pages → target

| Current page | Component | Fate |
|---|---|---|
| `/social/quickpost` (Quick Post) | inline | → **Compose** (Post-now mode) |
| `/calendar-os` (Create a Post) | `EditorialBoard` | → **Compose** (hub / Schedule mode) |
| `/social` (Plan a Month) | `SocialEngine` | → **Compose** (Plan-a-month mode) |
| `/studio` (Press Releases) | `StudioEditor` | → **Compose** (Press-release format) |
| `/voices` (Executive Voices) | `VoiceManager` | → **Setup** settings panel |
| `/approvals` (Approvals) | inline | → **Posts** › Needs approval (DUP of Review) |
| `/social/review` (Review) | `SocialReview` | → **Posts** › Needs approval (canonical) |
| `/social/calendar` (Posting Calendar) | `SocialMonthCalendar` | → **Posts** › Scheduled |
| `/social/outbox` (Delivery Status) | `SocialOutbox` | → **Posts** › Published (toggle of Scheduled) |

## Automate away (defaults, set once in Setup)
- Channel selection → last-used / all-connected
- Image style + brand colors → saved per company, applied automatically
- Exec voice → default voice
- Scheduling slots → auto on approve (already)
- Delivery-status polling → background cron (drop the manual button)
- AP boilerplate / safe-harbor / per-channel tailoring → already auto
- Standalone Disclosure Helper tab → retire (inline gate already)

## Keep as explicit human gates (compliance — non-negotiable)
Compose intent, edits, the Approve action, Reg-FD "red" acknowledgement, counsel
gate, quiet-mode block, auto-appended 17(b)/FLS disclosures. Nothing publishes
without a human approving.

## Phases (ship each)

**Phase 1 — Compose page** (highest value, lowest risk)
- New `/compose` page with mode toggle (Post now · Schedule · Plan a month) and
  format switch (Social ↔ Press release).
- Reuse the existing Quick Post flow for "Post now"; embed EditorialBoard for
  Schedule; embed SocialEngine for Plan-a-month; StudioEditor for Press release.
- Nav: add "Compose"; leave old pages reachable for now (no breakage).

**Phase 2 — Posts page**
- New `/posts` with tabs: Needs approval (merge Approvals+Review, pick one data
  lib, retire the dup) · Scheduled (calendar grid, list toggle) · Published.
- Nav: add "Posts"; retire Approvals/Review/Calendar/Outbox nav items.

**Phase 3 — Setup + automation + retire**
- Brand Setup accordion page (logo, colors, image style → drives buildImagePrompt,
  default voice, AI guidance). Move Voices in.
- Background cron for delivery status; remove manual button.
- Remove old `/social/quickpost`, `/calendar-os`, `/social`, `/studio`, `/voices`
  routes (redirect to the new pages) once Compose/Posts/Setup are proven.

## Notes / risks
- Two data pipelines exist: `lib/iros.ts` (Home + /approvals) and
  `lib/social/calendar.ts` (Review/Calendar/Outbox). Phase 2 must pick ONE for
  "Needs approval" and migrate/redirect the other to avoid split state.
- Keep old routes as redirects (not 404s) so bookmarks/links survive.
