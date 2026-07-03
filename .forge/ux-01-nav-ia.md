# UX Audit 01 — Navigation, Information Architecture & Density

Scope: `components/Sidebar.tsx`, `components/AppFrame.tsx`, `components/UserMenu.tsx`.
Focus: navigation, IA, and overall density only. Target user: an IR / comms person
at a small public company (often the *only* IR person, wearing five hats, not a power user).

---

## 1. The shell as it stands

`AppFrame.tsx` wraps every authenticated page in a four-zone chrome:

- **Left**: `Sidebar` — 28 items, 5 collapsible sections, fixed `w-56`.
- **Top**: `BackButton` (left) + `UserMenu` (right).
- **Right**: `CommsSidebar` — a *second* fixed rail (presence + team chat).
- **Floating**: `AiChat` bubble + `WelcomeModal`.

So the content column is squeezed between **two** permanent vertical rails plus a
top bar. That is the single biggest density problem before we even count nav items:
on a 1366-wide laptop (very common for this buyer) the actual workspace is a narrow
center slot. **Recommendation: the right comms rail should be collapsible/toggleable,
not permanent.** Most IR users are not living in team chat all day; make it a panel
that slides in from a header icon.

The sidebar already does two smart things worth keeping:
- Sections collapse, and on first visit every section except the active one is
  collapsed by default (good — fights the "wall of 28 links" problem).
- Each item has a `hint` (tooltip) and an `ⓘ` detail modal (good onboarding scaffolding).

But those are coping mechanisms for an overloaded IA, not a substitute for fixing it.
If you need a tooltip and a modal to explain what a top-level nav item does, the label
is wrong or the item shouldn't be top-level.

---

## 2. Is 28 items too much? Yes.

For a mono-IR-person at a small-cap, 28 top-level destinations is roughly 2–3x what
they can hold as a mental model. The realistic usage split:

### Core-daily / weekly (the 6–8 things they actually live in)
- **Home** (`/app`) — approval inbox. Correct as the anchor.
- **Compose** (`/compose`) — make content.
- **Posts** (`/posts`) — approve / schedule / track pipeline.
- **Investor Inbox** (`/stakeholders`) — inbound triage.
- **IR Calendar** (`/calendar`) — earnings / deadlines / quiet periods.
- **Analytics** (`/intelligence`) — program health / weekly board summary.
- **Counsel Console** (`/counsel`) — but only at *some* companies (see below).

### Occasional (monthly / event-driven)
- Document Vault, Doc Analyzer, CRM, Cap Table, Defend Your Name, Results,
  Your Public Page, Marketing Kit, Find Investors, Look Up a Ticker.

### Rare / one-time / setup (should NOT be permanent top-level nav)
- **Get started** (`/setup`) — one-time; belongs as a dismissible checklist / banner,
  not a forever nav item.
- **Social Media Setup** (`/social/setup`) — configure-once. This is **settings**, not a
  daily destination. It is mislabeled as content-creation because it sits in
  "Create & schedule."
- **Team** (`/team`) — administration.
- **Team Calendars** (`/calendars`) — see overlap with IR Calendar below.
- **Research Brief** (`/briefs`) — a $3,500 one-time *purchase*. That is a store/upsell,
  not navigation. It earns a nav slot only because it's a revenue line.
- **Embeds & Badges** (`/embeds`) — configure-once website widgets. Settings-adjacent.
- **Help Center** (`/help`), **Public Company 101** (`/learn`) — support/education, belong
  behind a single "Help" affordance (already in UserMenu — see duplication below).

**Verdict:** ~7 core, ~10 occasional, ~11 rare/setup. Well over half the sidebar is
stuff a user touches a few times ever. That is the definition of an overloaded IA.

---

## 3. Name / label confusion & overlapping destinations

These are the concrete traps a new user hits:

1. **Compose vs Posts** — genuine overlap. "Compose" creates a post; "Posts" is the
   pipeline that *also* lets you schedule and track. Both live in the same section, both
   are about posts, and Compose's own hint says it can "schedule" — which is also Posts'
   whole job. A user will not know where to go to schedule something. **These should be
   one destination** ("Posts", with a prominent "New post" action) or clearly split into
   **Create** (blank-canvas authoring) vs **Pipeline** (queue/calendar/status) with
   labels that say exactly that.

2. **IR Calendar vs Team Calendars** — two calendar items back-to-back. The distinction
   (IR dates vs team/personal calendars, with per-teammate visibility) is real but
   invisible from the labels. Users will guess wrong. **Merge into one "Calendar"** with
   IR / Team / Personal as tabs or filters.

3. **Defend Your Name vs Results vs Your Public Page** — three reputation items whose
   scopes blur:
   - "Defend Your Name" (`/company`) = threat monitoring + Visibility Score.
   - "Results" (`/proof`) = Visibility Score *over time* + published-post log + approval audit.
   - "Your Public Page" (`/t`) = the live public investor page.
   Visibility Score appears in **both** Defend Your Name and Results, so users won't know
   which one "owns" it. "Results" and the historical "Proof" naming (route is `/proof`,
   label is "Results") is exactly the kind of drift that confuses. Pick one home for the
   score. ("Defend Your Name" is also melodramatic branding — see jargon below.)

4. **Team (sidebar `/team`) vs Team (UserMenu `/admin/team`)** — **two different routes,
   same label, same product.** `Sidebar.tsx` links `/team`; `UserMenu.tsx` links
   `/admin/team`. This is a live IA bug: two "Team" entry points that may not even be the
   same page. Consolidate to one route.

5. **Help Center — duplicated.** It's a top-level sidebar item *and* a UserMenu item, both
   `/help`. Pick one (UserMenu is the conventional home for Help).

6. **Analytics (`/intelligence`) vs Results (`/proof`)** — both are "how is my program
   doing" dashboards (metrics, weekly summary vs visibility-over-time + published log).
   Overlapping intent; users won't know which to open for "how are we doing."

7. **Look Up a Ticker (`/ticker-audit`) vs Your Public Page (`/t`)** — both render a
   ticker report/page. Fine to keep separate, but they should visually acknowledge each
   other ("this is your page; look up any other ticker here").

---

## 4. Jargon a non-expert wouldn't parse

The labels are *mostly* admirably plain (the file even documents this intent). Remaining
offenders:

- **"Counsel Console"** — "Counsel" = lawyer; fine for legal, opaque to a comms hire.
  Better: "Legal Review" or "Legal Sign-off."
- **"Cap Table"** — standard finance term but a comms person may not know it; the hint
  helps. Acceptable, borderline.
- **"Reg FD" / "8-K"** appear in hints, not labels — acceptable (this audience should
  learn these), but never put them in a *label*.
- **"Defend Your Name"** — not jargon but *tonally alarmist* and vague; reads like a
  reputation-panic upsell rather than "monitoring & response." Rename to
  **"Reputation"** or **"Monitoring."**
- **"Doc Analyzer" / "Document Vault"** — clear.
- **"Embeds & Badges"** — "Embeds" is developer-speak. "Website Widgets" is friendlier.
- **"Investor Inbox"** — clear and good.

---

## 5. Proposed leaner IA (before / after)

Goal: cut permanent top-level nav from **28 → ~12**, move setup/config to Settings,
move one-time/purchase/education items out of the daily nav, merge overlaps.

### BEFORE (28 items / 5 sections)
```
Start here:        Home · Get started · Analytics
Create & schedule: Compose · Posts · Social Media Setup · IR Calendar · Team Calendars · Team
Comply & investors:Counsel Console · Doc Analyzer · Document Vault · CRM · Investor Inbox · Find Investors · Cap Table
Grow & reputation: Defend Your Name · Results · Your Public Page · Marketing Kit · Research Brief · Embeds & Badges · Look Up a Ticker · Help Center · Public Company 101
Admin:             Back Office · Lead Finder
```

### AFTER (12 primary items / 4 sections + Account menu + optional More)
```
WORK (daily)
  Home                     (/app)            approval inbox — unchanged
  Create                   (/compose)        authoring only ("New post")
  Pipeline                 (/posts)          approve · schedule · track (absorbs Compose's scheduling)
  Investor Inbox           (/stakeholders)   inbound triage
  Calendar                 (/calendar)       tabs: IR · Team · Personal (merges Team Calendars)

COMPLY
  Legal Review             (/counsel)        renamed from Counsel Console
  Doc Analyzer             (/analyzer)
  Document Vault           (/documents)

INVESTORS
  CRM                      (/crm)            Find Investors becomes a tab/action inside CRM
  Cap Table                (/captable)

REPUTATION
  Reputation               (/company)        renamed from Defend Your Name; owns Visibility Score
  Public Page              (/t)              includes "Look up any ticker" action; Results/proof becomes a tab here

ACCOUNT MENU (top-right, already exists)
  Settings ▸ Brand & Social (was Social Media Setup) · Website Widgets (was Embeds) · Team (single route) · Billing · Workspace
  Get started (checklist)  → also a dismissible home banner, not nav
  Help Center · Public Company 101  → single "Help & Learn" entry
  Marketing Kit            → surface contextually (e.g. after publishing) or under a "Share" action
  Research Brief           → a "Store"/upsell card, not nav
  Look Up a Ticker         → global search box in the top bar (better than a nav item)

ADMIN (super-admin only, unchanged behavior)
  Back Office · Lead Finder
```

### What moved and why
- **Compose + Posts → Create + Pipeline** (or a single Posts hub): kills the #1 overlap.
- **Team Calendars → tab inside Calendar**: kills the two-calendar confusion.
- **Social Media Setup, Embeds, Team, Get started → Settings/Account**: these are
  configure-once, not daily nav. Frees 4 slots.
- **Research Brief → Store/upsell**, **Marketing Kit → contextual Share**: purchase and
  one-off assets don't deserve permanent nav.
- **Help Center + Public Company 101 → one "Help & Learn"** in UserMenu (removes the
  duplicate Help link that already exists there).
- **Find Investors → tab in CRM**: both are investor-list tools.
- **Results/proof → tab on Public Page** (or fold Visibility Score into Reputation) so the
  score has exactly one home.
- **Look Up a Ticker → top-bar global search**: it's a lookup, which is a search pattern,
  not a page-in-nav.

Net: **28 → 12 primary nav items**, plus a genuinely-optional "More/Store" and a fuller
Account menu. Sections drop 5 → 4 (Admin stays hidden for non-admins).

---

## 6. Priority fixes (in order)

1. **Fix the duplicate "Team" links** (`/team` vs `/admin/team`) — same label, different
   route. Pick one. (Correctness bug, not just polish.)
2. **Remove the duplicate Help Center** (sidebar + UserMenu both `/help`).
3. **Make the right `CommsSidebar` rail collapsible** — reclaim horizontal density.
4. **Merge Compose/Posts and IR Calendar/Team Calendars** — the two worst overlaps.
5. **Move configure-once items (Social Setup, Embeds, Team, Get started) into Settings.**
6. **Rename**: Counsel Console → Legal Review; Defend Your Name → Reputation;
   Embeds & Badges → Website Widgets.
7. **Give Visibility Score one home** (Reputation), referenced-but-not-owned elsewhere.
8. **Demote Research Brief (a purchase) and Look Up a Ticker (a search)** out of nav.

None of these require new pages — they're relabels, merges, and moving existing routes
between the sidebar and the already-existing Account menu.
