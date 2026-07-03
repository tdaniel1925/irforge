# UX Audit 02 — First-Run: Signup → Onboarding → Home / Get-started

Scope: the experience of a brand-new **company** user, from signup through the first useful screen. Files reviewed: `app/login/page.tsx`, `app/onboarding/page.tsx`, `app/setup/page.tsx`, `lib/setup.ts`, `app/app/page.tsx`, `components/HomeDashboard.tsx`, `components/WelcomeModal.tsx`, `app/api/onboard/route.ts`, `app/welcome/[ticker]/page.tsx`.

Overall: the flow is **well thought through** — real EDGAR prefill, a draft post waiting on first login, an accurate data-driven checklist, and repeated "nothing posts without approval" reassurance. Friction is concentrated in (a) too many onboarding fields shown up-front, (b) three overlapping "get started" surfaces that compete, and (c) undefined IR/compliance jargon.

---

## 1. Steps & fields to reach a usable state

**Path:** Landing CTA → `/login?mode=signup&type=company` → pick account type → email + password → (email confirmation currently OFF) → `/onboarding` (5 steps) → `/app` (Home) → WelcomeModal → `/setup` checklist.

**Signup (`app/login/page.tsx`):** Lean and good. Two fields (email, password) plus an investor/company toggle. Password has **no strength hint, no confirm field, and no visibility toggle** (`login/page.tsx:154`) — a first-timer who mistypes gets no feedback until a failed sign-in later.

**Onboarding wizard (`app/onboarding/page.tsx`):** 5 steps — Ticker → Confirm → Approver → Compliance → Plan.

- Step 0 (Ticker, line 122): Excellent. Single field, auto-EDGAR lookup, claim-link prefill. No notes.
- Step 1 (Confirm, line 137): Shows **6 fields** (name, ticker, exchange, sector, description, peers). Only name + ticker are required (`:153`). **Peers and one-line description could be deferred** — both are already in the `/setup` checklist (`lib/setup.ts:91`) and Settings. Asking them here lengthens the wizard for data the user may not have handy on day one.
- Step 2 (Approver, line 158): Name required; title + X handle optional. Reasonable, but the X-handle field plus the "connect the account later in Settings via **Ayrshare**" note (`:165`) introduces a vendor name a first-timer won't recognize (see §5).
- Step 3 (Compliance, line 171): Two pre-filled legal blobs. Good that they're prefilled and editable, but "**Section 17(b) disclosure**" (`:173`) is raw statute jargon.
- Step 4 (Plan, line 190): Prices ($1,500–$6,000/mo) shown, but "No card needed… we'll sort out billing later." This is a **deferrable step** — it collects a non-binding tier preference and could be skipped entirely for self-serve, moving billing into the app. It's the step most likely to cause drop-off (sticker shock right before "Activate").

**Verdict:** ~2 signup fields + up to ~10 onboarding fields across 5 steps. Sequence is clear (numbered progress bar, `:110`). Deferrable: peers, one-line description, and the whole Plan step.

## 2. What a brand-new company sees on Home

Two distinct empty states, both handled:

- **Before ticker connected** (`app/app/page.tsx:20-32`): Clean interstitial — "Let's finish setting up… Takes about a minute" with a single **Finish setup →** CTA to `/onboarding`. Clear, one action, no confusion. Good.
- **After onboarding**: `onboard` API always drafts at least one post (`api/onboard/route.ts:94-159`), so the **hero "Today's posts to approve" card is never a lonely zero** — it shows 1+ waiting. Strong first impression.

Widget empty states are handled but flat:
- Intel: "No analytics yet." (`HomeDashboard.tsx:88`) — dead-ends; no CTA to create activity.
- Morning read: "No recent coverage found for $TICKER. Check back tomorrow." (`:111`) — **note the bug: literal `$` then `{props.ticker}`, so it renders `$$AMFN`** (double dollar). Copy also tells the user to leave.
- Agenda: "Nothing scheduled today." (`:116`) — no "Add an event" link.
- Hero when zero: "Nothing waiting. Generate a calendar in the **Content Engine** to get posts flowing." (`:189`) — good direction, but "Content Engine" is an internal feature name and the text isn't a link (the whole card links to `/posts`, not to the generator).

**Verdict:** empty states are safe (never blank/broken) but mostly **descriptive, not directive** — they tell the user what's absent instead of offering the next action.

## 3. The 'Get started' checklist (`app/setup/page.tsx` + `lib/setup.ts`)

Strong: progress bars, "X of Y", real data-driven completion (no fake checkboxes), optional items excluded from 100% (`setup.ts:107-111`), and a celebratory all-done banner (`setup/page.tsx:26`). Each item links somewhere concrete.

Concerns:
- **Two sections + up to 11 items** (7 company + 4 personal) can feel heavy at first glance for an admin. Consider collapsing completed items or showing "3 left" prominently.
- **Overlap with the wizard:** "Connect your ticker", "Set who approves posts", "Set your disclosure language", "Add peer tickers" are all things the wizard *just* collected. A user who finished onboarding will see several already ticked — good — but the redundancy means the wizard and checklist aren't clearly one journey.
- Link targets are mostly `/settings` (four items point there, `setup.ts:83-91`) — fine, but landing on the same dense Settings page for four different tasks with no anchor/scroll-to means the user must hunt for the relevant field each time. Deep-link to sections would help.
- Personal item "Approve your first post" → `/app` (`setup.ts:98`) is correct and motivating.

## 4. Dead-ends / unclear CTAs / "what now?" moments

1. **Three competing entry points on first Home load:** the WelcomeModal ("Start setup →" to `/setup`), the checklist itself, and the Home hero (to `/posts`). The modal says setup "takes about 10 minutes" (`WelcomeModal.tsx:34`) while the pre-ticker Home says "about a minute" (`app/page.tsx:26`) and onboarding implies a quick flow — **inconsistent time estimates** erode trust.
2. **"I'll look around first"** (`WelcomeModal.tsx:44`) dismisses the modal permanently (sets `welcomed` flag) — a user who clicks it may never see the guided prompt again and land on a dashboard of empty widgets with no re-entry nudge except the sidebar.
3. **Empty widgets with no CTA** (Intel/Agenda, §2) are soft dead-ends.
4. **Plan step → "Activate my dashboard"** lands on `/app`, but the *value* the user was promised (a live public page) isn't surfaced — no "View your live $TICKER page" link anywhere post-activation, despite `/welcome/[ticker]` and `/t/[ticker]` existing. Missed payoff moment.

## 5. Jargon a first-time IR person won't parse

- **"Section 17(b) disclosure"** (`onboarding.tsx:173`) → rewrite label to "Paid-promotion disclosure (SEC §17(b))" with a one-line hint: "Required by law on compensated IR posts."
- **"Forward-looking statements notice" / "FLS"** — spell it out on first use; most IR pros know FLS, but the abbreviation `flsText` and terse label could add a hint: "Safe-harbor language for statements about the future."
- **"Ayrshare"** (`onboarding.tsx:165`) → drop the vendor name: "You'll connect your X account in Settings after setup."
- **"Content Engine"**, **"Threat Radar"**, **"13F investor targeting"**, **"Fund Finder"** (onboarding tiers `:8-9`, setup hints, Home hero) — feature/product names presented as if known. "13F" especially is insider shorthand; at least gloss it once ("13F — the filings that reveal who owns you").
- **"cadence" / "filing_thread"** are internal kinds, not user-visible — fine.
- **CIK** is collected silently (good — never shown as a required user field).

---

## Concrete rewrite suggestions

| Location | Current | Suggested |
|---|---|---|
| `HomeDashboard.tsx:111` | `No recent coverage found for ${props.ticker...}` (renders `$$AMFN`) | Fix to single `$`: `` `No recent coverage found for $${props.ticker?.toUpperCase() ?? ""} yet — we'll surface news as it appears.` `` |
| `HomeDashboard.tsx:88` | "No analytics yet." | "No analytics yet — approve and publish a post to start tracking. [Go to posts →]" |
| `HomeDashboard.tsx:116` | "Nothing scheduled today." | "Nothing scheduled today. [Add an event →]" (link to `/calendars`) |
| `HomeDashboard.tsx:189` | "Generate a calendar in the Content Engine to get posts flowing." | Make it a link: "You're all caught up. **Generate this week's posts →**" (link to the generator, not `/posts`) |
| `onboarding.tsx:173` | "Section 17(b) disclosure" | "Paid-promotion disclosure (required by SEC §17(b))" |
| `onboarding.tsx:165` | "…in Settings after onboarding (via Ayrshare)." | "You'll connect your X account in Settings after setup." |
| `onboarding.tsx` step 1 | 6 fields incl. peers + description | Move peers + one-line description out of the wizard; leave them to the `/setup` checklist and Settings. |
| `onboarding.tsx` step 4 | Full pricing table before "Activate" | Skip for self-serve, or reframe: "Pick a plan later — activate free now." Lead with the free activation, tuck prices behind a "See plans" expander. |
| `WelcomeModal.tsx:34` vs `app/page.tsx:26` | "10 minutes" vs "about a minute" | Pick one honest estimate (~3–5 min) and use it everywhere. |
| `login/page.tsx:154` | Bare password field | Add a show/hide toggle + minimal strength hint; keeps first-timers from silent typos. |
| Post-activation (missing) | — | On `/app` first load, add a one-time banner: "Your public page is live — **View $TICKER →**" linking to `/t/[ticker]`. Deliver the promised payoff. |

## Top friction points (ranked)

1. **Visible `$$TICKER` rendering bug** in Morning-read empty state (`HomeDashboard.tsx:111`) — first thing a new company may see; looks broken.
2. **Onboarding asks for deferrable data** (peers, description) and shows a **full pricing table right before activation** — length + sticker shock at the highest-drop-off moment.
3. **Three overlapping "get started" surfaces** (WelcomeModal, `/setup` checklist, Home hero) with **inconsistent time estimates** and no single clear "do this next."
4. **Empty widgets are descriptive, not directive** — several soft dead-ends with no CTA.
5. **Undefined jargon** (Section 17(b), Ayrshare, 13F, Content Engine, Threat Radar) aimed at IR staff who aren't lawyers or devs.
6. **Missing payoff:** nothing links the new company to its live public `$TICKER` page after activation.
