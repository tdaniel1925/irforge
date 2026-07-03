# UX Audit 04 — Settings, Secondary Tools & Cross-Cutting Patterns

Scope: `app/settings`, secondary tool pages (company, proof, intelligence, crm, stakeholders, analyzer, counsel, marketing-kit, captable), and shared UI (`components/ui.tsx`, `components/Term.tsx`, `components/UpgradePrompt.tsx`).

Overall: the app is visually consistent and the shared `ui.tsx` primitives are well-built. The dominant problems are (1) **jargon shown without the tooltip that already exists**, (2) **verbose / salesy subtitles** that bury the page's actual job, and (3) **inconsistent loading/empty/error states** — three parallel systems instead of one.

---

## 1. LOADING / EMPTY / ERROR STATES — inconsistent, three systems in play

There is a good shared kit (`EmptyState`, `LoadingState`, `Banner`/`ErrorBanner` in `components/ui.tsx:116-167`), but pages use it unevenly and hand-roll one-off variants.

### Loading
- `LoadingState` (`ui.tsx:125`) always says **"Loading PubcoZone…"** — branded, not contextual. Fine, but note server-rendered pages (crm, stakeholders, intelligence, counsel) never reach it; they block on `await` with no skeleton, so first paint is a hard pause. Client pages (settings, company, proof, analyzer, captable) do use it.
- `settings` SocialConnections rolls its own: `"Checking your connections…"` (`settings/page.tsx:492`) instead of a spinner primitive — acceptable but a fourth style.

### Empty states — the biggest inconsistency
The shared `EmptyState` (dashed border, centered, supports an `action` slot) is used in **only one place**: `proof/page.tsx:118` (`"No events yet."` — and even there with no action). Everywhere else empties are hand-rolled `<p>` tags, and quality swings wildly:

- GOOD (guides the user): `settings/page.tsx:495` "No accounts connected yet. Tap **Connect accounts** to link X, LinkedIn…"; `captable/page.tsx:116` "No holders yet. Click "+ Add holder" to start your cap table."; `analyzer/page.tsx:43` "No analyses yet. Paste a document above to start."
- WEAK (dead-ends the user): `proof/page.tsx:61` **"Nothing published yet — work the Do queue."** ("work the Do queue" is jargon-y and there is no link); `proof/page.tsx:118` **"No events yet."** (no guidance, no link); `captable/page.tsx:179` **"No convertible notes tracked."** (no CTA to add one, unlike the Holders tab right beside it — inconsistent within the same page); `company/page.tsx:153` threat empty is good copy but again a bare `<p>`.

Recommendation: route ALL empties through `EmptyState` and require an `action`. Concretely:
- `proof/page.tsx:61` → `<EmptyState message="No posts published yet." action={<Link href="/do">Go to your approval queue →</Link>} />`
- `proof/page.tsx:118` → add "This log fills in automatically as you draft, approve, and publish."
- `captable/page.tsx:179` → `<EmptyState message="No convertible notes tracked." action={<Button onClick={()=>setAdding(true)}>+ Add note</Button>} />`

### Error states — mostly good, one gap
- Client pages consistently use `ErrorBanner`/`Banner` and write friendly, actionable errors (e.g. `company/page.tsx:42` "Couldn't reach the threat scanner — check your connection and refresh."). This is a strength.
- Gap: server components (crm, stakeholders, intelligence, counsel, marketing-kit) have **no error UI at all** — an exception in `await getMetrics()`/`listPosts()` throws to the Next error boundary, not a `Banner`. If a data call fails the user gets a generic crash page, not the app's friendly banner. Recommend a try/catch → inline `Banner tone="error"` in each server page, or a route-level `error.tsx`.
- `settings` SocialConnections swallows load failures silently (`settings/page.tsx:332` `catch { /* leave defaults */ }`) — a failed fetch looks identical to "not configured." Surface a quiet retry line.

---

## 2. JARGON — Term.tsx exists and is good, but is barely wired up

`components/Term.tsx` is a solid inline-gloss component (dotted underline, hover + tap, plain-English 5th-grade definitions) with a 10-entry `GLOSSARY` (reg-fd, section-17b, 13f, quiet-period, fls, tamper-evident, visibility-score, 8-k, 10-k-q, material).

**The problem: it's used in only 3 files (6 total instances)** — `settings` (4), `company` (1), `investors` (1) — while jargon strings appear across **22 files (86 occurrences)**. So the tool to fix jargon exists but is almost never applied. Specific un-glossed terms on the audited pages:

- `intelligence/page.tsx:65,69,71` — **"Reg FD mix"**, **"RED posts were routed to your Counsel Console"**. "Reg FD" and the GREEN/YELLOW/RED classification are never explained here. Wrap "Reg FD" in `<Term id="reg-fd">` and add a one-line legend for the Green/Yellow/Red pills (what does Red mean to me?).
- `counsel/page.tsx:42` — **"Posts flagged RED by the Reg FD classifier"**; line 58 "🚨 RED", line 59 "% confidence". "Reg FD," "classifier," and "confidence" are all unexplained. Add `<Term id="reg-fd">` and a plain gloss of RED ("could be material — needs a lawyer's OK before it posts").
- `captable/page.tsx:41,56,57,61` — **"fully diluted"**, **"dilution overhang"**, **"variable-conversion ('toxic') note"**. The toxic-note banner (line 61) explains itself well — good — but "overhang" and "fully diluted" have no gloss. Add glossary entries `dilution`, `overhang`, `fully-diluted`.
- `settings/page.tsx:98` "SEC CIK (for EDGAR sync)", `:117` **"Peer tickers for 13F targeting"** — CIK/EDGAR unglossed (13F is glossed elsewhere but not here). Field labels are a natural place for `Term`.
- `proof/page.tsx:45` "Visibility Score" is NOT glossed here (it IS on `company/page.tsx:128`) — inconsistent. Same term, glossed on one page, bare on another.
- `company/page.tsx` uses "Rebuttal," "sentiment," "the tape is calm" (`:153`) — "the tape" is trader slang most micro-cap execs won't parse.

Recommendation: (a) grow `GLOSSARY` to cover cik, edgar, fully-diluted, overhang, red-classification; (b) do a sweep so the FIRST occurrence of each term on every page is wrapped in `<Term>`. The infrastructure cost is zero — it already exists.

---

## 3. PAGE HEADERS / SUBTITLES — several are verbose or salesy; a few bury the purpose

`PageHeader` (`ui.tsx:9`) is clean. The copy inside it is the issue. Ranked worst-to-best:

- `company/page.tsx:102-105` — **the worst offender**. Subtitle is a 45-word run-on: "Two things this page shows you: (1) anyone attacking… with a one-tap factual response ready, and (2) how visible you are to investors and whether that's improving." This is a paragraph, not a subtitle. Also the page TITLE is "Defense & Reach" but the prompt/nav calls it "Defend Your Name" — name mismatch. Rewrite: **"Defend Your Name"** / "See who's attacking or doubting you, respond with the facts, and track your investor visibility."
- `captable/page.tsx:41` — subtitle is TWO sentences and repeats itself: "…common, preferred, insiders, options, warrants, and what your convertible notes turn into. The fully-diluted number every financing decision hinges on, in one place." Cut to one: "Your fully-diluted ownership — shares, options, warrants, and what your convertible notes convert into."
- `analyzer/page.tsx:33` — long list-in-a-sentence plus a disclaimer crammed into the subtitle ("Drafting assistant, not legal advice."). Move the disclaimer out of the header (it's already repeated at line 82). Subtitle: "Paste any document and get a plain-English summary, key terms, risks, and possible disclosure triggers."
- `stakeholders/page.tsx:37` — "Your relationship graph + an AI triage box: paste any inbound message and it suggests who it's from, a category, and a safe reply." Slightly long but clear — acceptable.
- `proof/page.tsx:29` — "Screenshot any of it for your board." is a nice concrete cue, but "Proof that this is working" is a touch salesy inside the product. Minor.
- `marketing-kit/page.tsx:15` — "…ready to copy, post, or download — **free**." The "free" is marketing language that reads oddly inside a paid app. Drop it.
- GOOD, clear-in-first-sentence: `settings/page.tsx:70`, `intelligence/page.tsx:39`, `crm/page.tsx:24`, `counsel/page.tsx:42`.

Rule of thumb to apply: subtitle = one sentence, ≤15 words, describes the JOB not the benefit. No parenthetical (1)/(2) lists, no disclaimers, no "free."

---

## 4. CTA CLARITY — mostly good; two pages are option-walls, one has a buried primary

- STRONG single CTA: `analyzer` ("✦ Analyze document"), `counsel` (sign per card), `stakeholders`/`crm` (clear primary via workspace), `marketing-kit`.
- `settings/page.tsx` — long single-column form of 6 cards; the **"Save settings"** button is at the very bottom (`:154`) after Team + Social sections that DON'T save via that button (they persist independently). A user who edits the profile, scrolls past Social/Team, may not realize Save only covers the top cards. The dirty-dot (`:155` "Save settings •") helps, but consider a sticky save bar, or move Save directly under the profile/disclosure cards it governs.
- `company/page.tsx` — three headline stat cards (DEFEND/GROW/CONTROL) + a threat list + two side modules, each with its own button (Draft response, ↻ refresh score, Go to your queue). No single "do this first." The threat module is clearly the lead visually, but the three equal-weight stat cards up top dilute focus. Consider making DEFEND the primary and demoting GROW/CONTROL to a smaller strip.
- `captable/page.tsx` — the primary action ("+ Add holder"/"+ Add note") is a small right-aligned secondary-styled button (`:87,137`) above a table, easy to miss on an empty table. On empty state, promote it into the empty message (see §1).

---

## 5. VERBOSITY / MARKETING COPY INSIDE THE APP

The app leans wordy. Functional micro-copy is good; the explanatory paragraphs are where it over-explains.

- `settings/page.tsx` is the densest: AddDisclosure (`:219`) is a 40-word paragraph; SocialConnections has explanatory paragraphs at `:463`, plus modal helper text `:526` and a footnote `:569`. Individually reasonable, but stacked it's a lot of prose in a settings screen. Tighten each to one line.
- `UpgradePrompt.tsx` — this is fine and appropriately salesy (it's a paywall), BUT the same component is what users hit on `intelligence`, `stakeholders`, `counsel` when a feature is off. The "🔒 Not on your plan yet" + "See plans & upgrade" + "Talk to us" + "Already paying? Ask your admin…" is a lot of upsell for someone who may just be exploring. Acceptable for a gated feature; flag only that three CTAs (upgrade / email / ask admin) is one too many — pick two.
- `company/page.tsx:147` "We watch message boards, social media, news, and trading data…" and `:153` "the conversation is clean and the tape is calm" — evocative but longer than needed and uses trader slang. Trim.
- Emoji as UI labels (🛡 DEFEND, 📈 GROW, 🎙 CONTROL, 🚨 RED, ✦ on buttons) is used heavily on `company`, `counsel`, `intelligence`. Consistent within those pages, but note it's a distinct visual language from the calmer `settings`/`captable`/`proof` pages — the app has two tones. Worth a deliberate decision.

---

## Cross-cutting recommendations (priority order)

1. **Wire up `Term` everywhere jargon first appears** (biggest ROI — infra already exists; used in 3/22 files). Grow `GLOSSARY` with cik, edgar, fully-diluted, overhang, red-classification.
2. **Standardize empty states** on `EmptyState` with a required `action`. Fix the dead-end empties in `proof` and `captable/Notes`.
3. **Add error UI to the 5 server-component pages** (crm, stakeholders, intelligence, counsel, marketing-kit) — currently they crash to the Next error boundary instead of a `Banner`.
4. **Rewrite verbose subtitles** to one ≤15-word sentence. Priority: `company` (45-word run-on + title/name mismatch), `captable`, `analyzer`.
5. **Resolve the "Defend Your Name" vs "Defense & Reach" name mismatch** (`company/page.tsx:103`).
6. **Reconsider Settings save affordance** — Save sits below sections it doesn't control; consider a sticky save bar scoped to the profile/disclosure cards.

## What's genuinely good (keep)
- `components/ui.tsx` primitives are consistent and themable (`text-app`/`text-muted`/`text-faint`, surface tokens).
- Error copy on client pages is friendly and actionable (a real strength).
- `Term.tsx` component design is excellent — it just needs to be used.
- Inline-confirm pattern (no toasts/alerts) is applied consistently (matches the project's no-toast rule).
- `captable` toxic-note warning banner (`:61`) is a model example of explaining risk in plain English at the point of need.
