# UX Audit 03 — Core Content Workflow (Create & Publish Posts)

Scope: the unified **Compose** page (4 modes), the **Posts** page (3 tabs), and **Social Media Setup**. Auditing only the create-and-publish path.

Files reviewed:
- `app/compose/page.tsx`, `components/ComposeShell.tsx`
- `components/QuickPostComposer.tsx`, `components/EditorialBoard.tsx`, `components/StudioEditor.tsx`, `components/SocialEngine.tsx`
- `app/posts/page.tsx`, `components/PostsShell.tsx`
- `app/social/setup/page.tsx`
- `components/Sidebar.tsx` (nav context)

---

## TL;DR — the five biggest problems

1. **Press-release mode is a dead end.** `StudioEditor` has NO save / publish / schedule / copy / download action — you generate a release into a `<textarea>` and the flow stops. (`StudioEditor.tsx`, entire file — no submit handler exists.)
2. **"Plan a month" is a visibly bolted-on tool.** `SocialEngine` uses a different color system (indigo/gray/white) and different typography from every other surface (emerald/`app`/`surface` tokens). It looks like a different product. (`SocialEngine.tsx:44,116,144,196,212`.)
3. **Compose (4 modes) vs Posts (3 tabs) overlap and blur.** Both talk about "approve," "schedule," "compliance," "nothing publishes without you." A user who wants to "post something" has 3 top-level destinations and 7 sub-modes with no guidance on which to pick.
4. **Two parallel post pipelines with different rules.** QuickPost/Studio use one engine (`/api/social/quickpost`, `/api/studio`); EditorialBoard/SocialEngine use another (`/api/iros/*`, `/api/social/*`). The Posts "Needs approval" tab literally stacks two unrelated inboxes (`ApprovalsInbox` + `SocialReview`) under one tab (`PostsShell.tsx:56-68`).
5. **Setup is a scavenger hunt.** `social/setup` is 7 accordions, but 4 of them (Brand basics, Connected accounts, Compliance, and logo/color editing overlap) just say "go edit this in **Settings**" (`setup/page.tsx:134,180,188`). It's a table of contents pretending to be a setup wizard.

---

## 1. Mental model — is it obvious where to go?

**No.** The IA presents this decision tree to a user who just wants to post:

- **Compose** → 4 modes: Post now / Schedule / Plan a month / Press release
- **Posts** → 3 tabs: Needs approval / Scheduled / Published
- **Social Media Setup** → 7 accordions

That's **3 nav items and 14 sub-surfaces** for one job-to-be-done. Both Compose and Posts carry near-identical subtitles about compliance and approval (`ComposeShell.tsx:46` vs `PostsShell.tsx:39`), so they don't self-differentiate.

**Overlaps that will confuse users:**

- **"Schedule" appears in both places.** Compose → Schedule (EditorialBoard, a kanban) is where you *create+move* scheduled posts; Posts → Scheduled (a calendar) is where you *view* them. Same word, two locations, and the kanban already has a "Scheduled" column (`EditorialBoard.tsx:33`) — so "Scheduled" now exists in three spots.
- **"Approve" appears in both places.** EditorialBoard has an in-board Approve button (`EditorialBoard.tsx:243`) AND the Posts "Needs approval" tab is a separate approval inbox. Where does a user approve? Both. It depends which engine drafted the post.
- **"Plan a month" (SocialEngine) never routes the user onward.** After saving a strategy it renders a `SocialCalendar` inline (`SocialEngine.tsx:219`), but its drafts surface under Posts → Needs approval → "Scheduled-post drafts" (`SocialReview`), a different component. Nothing tells the user to go look there.
- **The empty-state text admits the confusion:** Posts → Scheduled tells you to go to "Compose → Plan a month" to populate it (`PostsShell.tsx:92`). The product is cross-referencing its own tabs because the flow isn't linear.

**Verdict:** The mental model is *filed by tool*, not *by user intent*. A first-time user cannot predict where "the thing I made" will show up.

---

## 2. Within each mode

### Post now — `QuickPostComposer` (the best-designed surface)
Clean 1-2-3 layout (compose → channels → preview/publish, `QuickPostComposer.tsx:269,348,374`). Primary action is unambiguous ("Preview post →" then "✓ Approve & publish now"). Compliance is explained inline and *contextually* (disclosure note at `:313`, Reg-FD ack at `:461`, over-limit "Fit" helpers at `:420`). This is the model the others should copy.
- **Minor friction:** the AI-image block always shows a "Brand colors" text input (`:325-335`) even though brand colors are *already* set globally in Social Setup. Duplicated input; should default from the saved brand and be hidden behind "customize."
- **Minor:** "Preview post →" is a mandatory extra click even for a trivial 1-channel text post. Consider letting Preview double as Publish when there are zero flags (see §3).

### Schedule — `EditorialBoard`
A 5-column kanban (Drafts / In review / Approved / Scheduled / Published) with drag-and-drop, per-card Reg-FD check, approve, schedule, publish, pull. **This is powerful but heavy** for the stated goal ("Draft, check, approve & schedule"). A single card can present up to 5 different action buttons depending on state (`:232-263`).
- **The state machine is invisible.** `allowedTargets` (`:61`) silently forbids drags (RED → approved), only surfacing a red error toast-substitute *after* a failed drop (`:77`). Users learn the rules by hitting walls.
- **Terminology drift:** columns say "In review"; the button says "Mark reviewed"; Posts calls the same concept "Needs approval." Three names for one stage.

### Plan a month — `SocialEngine`
Interview → review strategy → calendar. The interview is reasonable (`:112-153`). **But:**
- **Off-brand styling** (see TL;DR #2) — `indigo-600`, `border-gray-300`, `text-gray-700`, white cards. Every other component uses the `emerald` + `surface`/`app` token system. Ships as a different visual product.
- **No dark-mode support** — hardcoded `bg-white`/`text-gray-700` will be unreadable in the app's dark theme, which every other file handles via tokens.
- **The payoff is buried.** After saving the strategy the actual month of posts is generated by `SocialCalendar` at the very bottom (`:219`), below a long form. The headline promise ("AI builds a month") is the *last* thing on the page.

### Press release — `StudioEditor`
- **Dead end (critical).** There is no way to keep the output. No Save, Publish, Schedule, Copy, or Download. The generated release lives in an editable `<textarea>` (`:112`) and the only buttons are Generate/Revise (`:79`) and Polish (`:106`). A user spends effort producing a release and cannot do anything with it. This is the single highest-severity finding.
- Otherwise the generate/revise/edit loop is clean and the AI bar is well-placed.

**Compliance/disclosure — explained or imposed?**
Mixed. QuickPost explains it well inline. StudioEditor explains it (`:84`). EditorialBoard *imposes* it (silent drag rules; a bare "🛡 Reg FD check" button with no explanation of what RED means until you hit it). SocialSetup's Compliance accordion (`setup/page.tsx:187`) is good copy but is three clicks away from where posting happens.

---

## 3. Click/decision count to publish one simple text post

Happy path, "Post now," 1 channel, no flags, accounts already connected:

1. Sidebar → **Compose** (lands on "Post now" by default — good)
2. Click textarea, type
3. Click the channel chip
4. Click **Preview post →**
5. Read preview
6. Click **✓ Approve & publish now**

**~6 clicks / 4 real decisions.** Reasonable — *if* accounts are connected. But note:
- If accounts aren't connected, the channel card is empty and sends the user to **Settings** (`:355`) — a hard context switch out of the flow.
- The **Preview step is mandatory** (`:375`) even when there is nothing to review. For a clean post this is one forced click + one screen of reading with no decision. **Recommendation:** when preview returns zero flags/blocks, collapse Preview and Publish into a single "Publish now" button that shows the mockup inline, or auto-advance.

For **EditorialBoard**, the same simple post is: New post → (optional AI draft) → Save as draft → Reg FD check → Mark reviewed → Approve → Schedule/Publish (pick channels) → Send. **~8-10 clicks across 5 columns.** Far more than "post something" warrants; this mode should be opt-in for teams with real approval chains, not a peer of Post-now.

---

## 4. Consistency — one product or four bolted-together tools?

**Four tools wearing a shared header.** ComposeShell's tab bar (`:49-64`) and PostsShell's tab bar (`:41-54`) are the *only* thing unifying them, and even they aren't shared code (two copy-pasted `TABS.map` blocks with identical styling — should be one `<TabBar>` component).

| Signal | Post now | Schedule (Board) | Plan a month | Press release |
|---|---|---|---|---|
| Color system | emerald + `surface`/`app` tokens | emerald + tokens | **indigo + gray + white (off)** | emerald + tokens |
| Dark mode | yes | yes | **no** | yes |
| Primary btn style | `<Button>` from `ui` | raw `<button>` emerald | raw `<button>` indigo | raw `<button>` emerald |
| Layout | linear cards | kanban columns | long form → calendar | doc + AI bar |
| "Draft" action | — | "Save as draft" | "Build my strategy" | "Generate" |
| Uses shared `<Button>`/`<Card>` | yes | no | no | no |
| Backend engine | `quickpost` | `iros/*` | `social/*` | `studio` |

Only "Post now" and Social Setup consistently use the shared `ui` primitives (`Button`, `Card`, `PageHeader`). The others hand-roll buttons, so hover/disabled/focus states differ subtly across modes. **SocialEngine is the clear outlier** and reads as a separately-built feature that was tab-mounted without a design pass.

Terminology is also inconsistent: draft/reviewed/approved/scheduled (Board) vs needs-approval/scheduled/published (Posts) vs interview/strategy (Engine) vs generate/revise (Studio).

---

## 5. Concrete simplifications

**Structural**
- **Merge Compose + Posts into one "Posts" hub** with a create button. Create is an *action*, not a destination; the pipeline (approve/scheduled/published) is the home. This kills the Compose-vs-Posts overlap in §1.
- **Demote the 4 Compose modes to 2 real choices:** "Quick post" (the current Post-now, default) and "Campaign" (the strategy→month engine). Fold **Schedule** into Quick post as a "Publish now ▾ / Schedule for…" toggle on the publish button — it doesn't need a whole kanban to *pick a date*. Reserve the kanban for teams that turn on a multi-stage approval feature.
- **Press release** should live under Quick post as a "long-form" length option (or a `/documents` area), and **must** gain Save + Publish/Schedule + Copy + Download. Right now it produces nothing usable.

**Defaults & hide-until-needed**
- QuickPost: default channels to whatever's connected (or last-used); default brand colors from Social Setup and hide the color input behind "Customize image" (`QuickPostComposer.tsx:325`).
- Collapse mandatory Preview into Publish when there are no flags (§3).
- EditorialBoard: hide columns that are empty *and* unreachable for the current user; show the state-machine rules as inline hints, not post-failure errors (`EditorialBoard.tsx:77`).

**Auto-handle**
- Disclosures/FLS notes are already auto-appended — good. Extend that philosophy: auto-run the Reg-FD check on preview/save (it's already automatic in QuickPost) so the manual "🛡 Reg FD check" button on the board (`:235`) disappears.
- "Fit to limit" (`:181`) is excellent — make it the *default* behavior (auto-fit on preview, with an "undo" ) instead of an error the user must resolve.

**Consistency fixes**
- Re-skin `SocialEngine` onto the `ui` primitives + emerald/`surface` tokens; add dark mode. Highest-ratio visual fix.
- Extract one shared `<TabBar>` used by ComposeShell and PostsShell.
- Standardize stage vocabulary to one set (e.g. Draft → Review → Approved → Scheduled → Published) across Board and Posts.

**Setup**
- Turn `social/setup` into an actual wizard that *does* the work inline (connect accounts, set disclosures) instead of linking to Settings for half its sections (`setup/page.tsx:134,180,188`), or merge the four "go to Settings" accordions away.

---

## Severity ranking

1. **Press-release dead end** — feature produces no usable output. (blocker)
2. **SocialEngine off-brand + no dark mode** — looks broken/unfinished in the real theme. (high)
3. **Compose vs Posts overlap** — users can't predict where posts go; "Schedule"/"Approve" duplicated. (high)
4. **EditorialBoard over-heavy for "just post"** + invisible state machine. (medium)
5. **Setup is a link farm** to Settings. (medium)
6. **Mandatory preview / duplicated brand-color input** in QuickPost. (low)
