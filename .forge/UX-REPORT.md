# PubcoZone / IRForge — UX friction report

**Date:** 2026-07-01 · Scope: full authenticated app UX (nav, onboarding, content
flow, settings, secondary tools, cross-cutting patterns). Four parallel design
reviews + direct code verification of every concrete bug claim.

**Verdict:** Your instinct is right — the app is *feature-rich but heavy*. The core
problem isn't any one page; it's **too much surface presented at once** (28 nav items,
two permanent side rails, overlapping Compose/Posts destinations) plus **a few genuine
dead-ends and label inconsistencies**. The good news: almost all fixes are relabels,
moves, and consolidation — not new features. QuickPostComposer is the quality bar; most
of the app should move toward its clarity.

Detailed sub-reports: `.forge/ux-01-nav-ia.md`, `ux-02-onboarding.md`,
`ux-03-content-flow.md`, `ux-04-settings-crosscutting.md`.

---

## CRITICAL — real bugs / dead-ends (verified in code)

### 1. Press-release editor produces nothing usable  ⟶ StudioEditor.tsx
You can generate/revise a press release into a textarea, but there is **no Save,
Publish, Schedule, Copy, or Download** anywhere in the component (verified: zero such
actions). The whole "Press release" mode is a dead end. **Fix:** add Copy + Download +
"Save to Vault" (and optionally "Send as post"). Highest severity — a headline feature
that can't deliver output.

### 2. Duplicate, inconsistent "Team" nav  ⟶ UserMenu.tsx:60 vs Sidebar.tsx:34
Two nav entries both labeled "Team": the account menu points to the OLD `/admin/team`,
the sidebar to the new `/team`. Leftover from the recent team-route move. **Fix:** point
UserMenu at `/team`; keep one entry point. (5-min fix.)

### 3. Server-component tool pages have no error UI
`crm`, `stakeholders`, `intelligence`, `counsel`, `marketing-kit` render server-side
with no error boundary, so a failed data call throws to Next's generic error screen
instead of a friendly Banner. **Fix:** wrap data calls / add error.tsx or try-catch →
`<Banner tone="error">`.

> Note: a reviewer flagged a "$$AMFN" double-dollar on Home — **verified FALSE**; the
> code uses `` `$${ticker}` `` which renders correctly as `$AMFN`. Not a bug.

---

## HIGH — density & "it's a lot"

### 4. 28 nav items in 5 sections is ~2–3× what the target user holds
Only ~7 are core-daily (Home, Compose, Posts, Investor Inbox, IR Calendar, Analytics,
Counsel). Over half are configure-once (Social Media Setup, Embeds, Team, Get started),
one-time (Research Brief), or educational (Help Center, Public Company 101) and don't
deserve permanent slots. **Fix:** cut permanent nav from ~28 → ~12 (4 sections). Move
setup/embeds/team/help/marketing-kit/brief/ticker-lookup into Settings, the account
menu, or contextual actions. No new pages — just moves. (Before/after in ux-01.)

### 5. Two permanent side rails squeeze the workspace  ⟶ AppFrame.tsx:68
Left sidebar **and** a right `CommsSidebar` chat rail are both always-on. On a laptop
that leaves a narrow middle column. **Fix:** make the right rail collapsible (default
collapsed), toggled from the top bar.

### 6. Overlapping / confusing labels
- **Compose vs Posts** — both handle scheduling & approval; users can't predict where a
  post lands after creating it (see #8).
- **IR Calendar vs Team Calendars** — indistinguishable by label.
- **Defend Your Name vs Results** — Visibility Score appears in both.
- Jargon labels: **Counsel Console → "Legal Review"**, **Defend Your Name →
  "Reputation"**, **Embeds & Badges → "Website Widgets"**, **Investor Inbox** is good.

---

## HIGH — the core content flow is fragmented

### 7. "Where do I go to post?" is unclear
A user wanting to post faces **Compose (4 modes) + Posts (3 tabs) + Social Media Setup**.
Compose modes (Post now / Schedule / Plan a month / Press release) and Posts tabs (Needs
approval / Scheduled / Published) overlap: "Schedule" and "Approve" exist in *both*
surfaces, and a post created in one place surfaces under a differently-named tab
elsewhere. **Fix:** make Compose = *create*, Posts = *manage/track*; remove scheduling/
approval overlap; after publishing, link the user straight to where it now lives.

### 8. Modes feel bolted-together, not one product
- **SocialEngine ("Plan a month")** uses indigo/gray/white with **no dark mode** while
  everything else uses the shared emerald + surface tokens — reads as a different app.
- **EditorialBoard ("Schedule")** is a 5-column kanban needing ~8–10 clicks to post one
  thing, with invisible state-machine rules (a drag just fails). Too heavy for the common
  case.
- **Social Media Setup** accordions are largely a **link farm** back to Settings.
**Fix:** restyle SocialEngine to the design system; give EditorialBoard a one-click
"quick publish"; make Setup hold real controls, not links.

### 9. QuickPostComposer is the model — copy it
Clean single-column compose → preview → publish. Use it as the pattern the other modes
converge toward.

---

## MEDIUM — onboarding & first-run

### 10. Onboarding asks for deferrable data + sticker shock at the worst moment
Step 1 shows 6 fields when only **name + ticker** are required (peers & description are
also in the Settings checklist). The final step shows a full **$1,500–$6,000/mo pricing
table right above "Activate my dashboard"** — sticker shock at the highest-drop-off
moment, even though no card is required. **Fix:** 2-field first step; move/soften pricing.

### 11. Three competing "get started" surfaces
A WelcomeModal, the `/setup` checklist, and the Home hero each point somewhere different
and give inconsistent time estimates ("1 minute" vs "10 minutes"). **Fix:** one canonical
next-action; make the others defer to it.

### 12. Empty widgets are soft dead-ends
New-user Home widgets (Intel, Agenda) describe what's missing but offer **no CTA**. **Fix:**
every empty state gets one clear action (route through the shared `EmptyState`).

### 13. Missing payoff after activation
Nothing links a newly-activated company to its **live public ticker page** — the promised
value is never shown. **Fix:** end onboarding with "View your public page →".

---

## MEDIUM — cross-cutting polish

### 14. Jargon glossary exists but is barely wired in
`Term.tsx` is a good inline-gloss tooltip with a 10-term glossary — but used in only 3 of
22 files while jargon appears ~86 times (Reg FD, FLS, RED classification, fully-diluted,
overhang, CIK, EDGAR, 13F, lock-up). Same term glossed on one page, bare on another.
**Highest-ROI polish:** sweep `Term` in where each term first appears. Infra already
exists.

### 15. Inconsistent empty states
Shared `EmptyState` used in one place; the rest are hand-rolled paragraphs, several with
no next step (proof published/audit tabs, captable Notes). **Fix:** route all through
`EmptyState` with a required action prop.

### 16. Verbose / salesy in-app copy
Several page subtitles are 2-sentence marketing runs (`company` page = 45-word run-on
with a title/name mismatch — header says "Defense and Reach," nav says "Defend Your
Name"; `captable`, `analyzer` two-sentence subtitles; `marketing-kit` says "free" inside
a paid app). **Fix:** one-line functional subtitles; fix the title mismatch.

### 17. Settings Save button controls less than it appears to
The global Save sits below sections it doesn't govern (several sections self-save). **Fix:**
move/scope the Save, or make per-section saving obvious.

---

## Suggested sequencing (fastest value first)
1. **Quick wins (hours):** #2 Team dup, #16 copy/title fixes, #13 public-page link,
   #12 empty-state CTAs on Home.
2. **Dead-ends (half-day):** #1 StudioEditor outputs, #3 error UI on server pages.
3. **Density (1–2 days):** #4 nav consolidation, #5 collapsible right rail.
4. **Content flow (larger):** #7/#8 Compose↔Posts model + SocialEngine restyle.
5. **Polish sweep (ongoing):** #14 Term glossary, #15 EmptyState, #6 relabels.
